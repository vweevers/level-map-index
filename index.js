var Trigger  = require('level-trigger')
  , range    = require('./range')
  , xtend    = require('xtend')
  , deep     = require('deep-dot')
  , through2 = require('through2')
  , eos      = require('end-of-stream')

module.exports = function (db, opts) {
  db._indices || install(db, opts)
  return db
}

function install(db, defs) {
  db._indices = {}
  if (typeof defs == 'function') defs = {map: defs}
  defs = xtend({map: defaultMap, get: {}}, defs || {})

  db.index = function(_p, _opts) {
    if (Array.isArray(_p)) var props = _p, opts = _opts
    else {
      props = Array.prototype.slice.call(arguments)
      if (typeof props[props.length-1] != 'string') opts = props.pop()
    }

    var name = JSON.stringify(props)
      , idx  = db._indices[name]

    if (!idx) {
      if (typeof opts == 'function') opts = {map: opts}
      opts = xtend(defs, opts || {})
      idx = db._indices[name] = createIndex(db, props, name, opts)
    }

    return idx
  }

  db.hasIndex = function(p) {
    var props = Array.isArray(p) ? p : Array.prototype.slice.call(arguments)
    return !!db._indices[JSON.stringify(props)]
  }

  // todo: move these methods to mapDb, create shortcuts on db
  db.streamBy = function(props_, values, opts) {
    var idx = db.index(props_)
      , props = idx._indexProps // always an array

    if (!idx.completedFirst || !idx.isComplete()) {
      var proxy = through2.obj() // passthrough
      idx.once('complete', function(){
        db.streamBy(props_, values, opts).pipe(proxy)
      })
      return proxy
    }

    opts = xtend(defs, defs.get, {values: true, keys: false}, opts || {})

    var rng = values && values.$from
      ? opts.map(null, values.$from, props)
      : values

    var idxOpts = { values: true, keys: false }

    if(rng) {
      if (!Array.isArray(rng)) rng = [rng]
      while(rng.length<=props.length) rng.push(true)
      rng = range.range(rng)
      idxOpts.start = idxOpts.min = rng.min
      idxOpts.end = idxOpts.max  = rng.max
    }

    return idx.createReadStream(idxOpts)
      .pipe(through2.obj(function(key, _, next){
        db.get(key, opts, function(err, value){
          if (err) return next(err)
          if (opts.values) next(null, value)
          else next(null, { key: key, value: value })
        })
      }))
  }

  // idx, [range, opts], cb
  db.by = function(idx, range, opts, cb) {
    if (typeof range == 'function') cb = range, opts = {}, range = null
    else if (typeof opts == 'function') cb = opts, opts = null

    var a = [], stream =
      db.streamBy(idx, range, opts).once('error', cb)
      .pipe(through2.obj(function(o,_,next){ a.push(o); next() }))

    stream.resume()
    eos(stream, function(err){ cb(err, a) })
  }

  // idx, [range, opts], cb
  db.getBy = function(idx, range, opts, cb) {
    if (typeof range == 'function') cb = range, opts = {}, range = null
    else if (typeof opts == 'function') cb = opts, opts = {}

    opts.limit = 1
    this.by(idx, range, opts, function(err, items){
      if (err) return cb(err)
      else if (!items.length) return cb(new Error('Not found'))
      cb(null, items[0])
    })
  }
}

function defaultMap(id, obj, props, done) {
  var res = props.map(function(prop){
    return deep(this, prop)
  }, obj)

  return done ? done(null, res) : res
}

function createIndex(db, props, name, opts) {
  var mapDb = db.sublevel(name)

  mapDb._indexProps = props

  // store the keys a value has been mapped to.
  var mapped = mapDb.sublevel('mapped')

  // todo: mismatch with $from (can be fixed
  // once the methods above are moved to this scope)
  var map = opts.map
  var jobs = mapDb.sublevel('mapjobs')

  // when record is inserted, pull out what it was mapped to last time.
  var trigger = Trigger(db, jobs, function (key, done) {
    mapped.get(key, function (_, oldValue) {
      function update(err, value) {
        if (err) {
          // ignore user error, until Trigger gets a maxRetries option
          console.log(err)
          return done()
        }

        var batch = [], newValue

        if(value != null) {
          newValue = range.stringify(value.concat(key))

          batch.push({ key: newValue, value: key, type: 'put' })
          batch.push({ key: key, value: newValue, type: 'put', prefix: mapped })
        }

        if (oldValue && newValue!==oldValue)
          batch.push({key: oldValue, type: 'del'})

        mapDb.batch(batch, done)
      }

      db.get(key, opts.get, function (_, value) {
        if (value == null) update() // deleted, so delete mapping
        else if (map.length<4) update(null, map(key, value, props))
        else map(key, value, props, update)
      })
    })
  })

  mapDb.start = function () {
    trigger.start()
    return mapDb
  }

  mapDb.isComplete = function() {
    return trigger.isComplete()
  }

  mapDb.createViewStream = function(opts) {
    return mapDb.createReadStream(opts).on('data', function(d) {
      d.key = range.parse(d.key)
    })
  }

  var post = mapDb.post
  mapDb.post = function(key, hook) {
    if (typeof key == 'function') hook = key, key = null

    function parse(op){
      op.key = range.parse(op.key)
      hook(op)
    }

    // sublevel doesn't handle null key
    post.apply(mapDb, key==null ? [parse] : [key, parse])

    return mapDb
  }

  jobs.once('complete', function(){
    mapDb.completedFirst = true
  })

  jobs.on('complete', function(){
    mapDb.emit('complete')
  })

  mapDb.start()
  return mapDb
}
