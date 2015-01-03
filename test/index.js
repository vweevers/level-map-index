var test = require('tape')
  , level = require('level-test')({ valueEncoding: 'json' })
  , sub = require('level-sublevel')
  , index = require('../')
  , after = require('after')

function create(opts) {
  var sdb = sub(level(), { valueEncoding: 'json'});
  return index(sdb, opts)
}

test('ff', function(t){
  var db = create()

  db.index('price')
  db.index(['author.name', 'price'])
  db.index('custom', function map(key, value){
    return [value.author.name.indexOf('a')]
  })

  var book1 = { title: 'cooking', price: 20, author: { name:  'bob' } }
  var book2 = { title: 'working', price:  5, author: { name:  'bob' } }
  var book3 = { title: 'driving', price: 19, author: { name:  'sara' } }

  db.batch([
    {type: 'put', key: book1.title, value: book1},
    {type: 'put', key: book2.title, value: book2},
    {type: 'put', key: book3.title, value: book3}
  ], function(err){
    if (err) return t.fail(err)
    setTimeout(search, 300)
  })

  t.plan(6)

  function search() {
    var end = after(4, testHook)

    db.by(['author.name', 'price'], 'bob', function(err, items) {
      t.deepEqual(items, [book2, book1])
      end()
    })

    db.by(['author.name', 'price'], ['bob', 5], function(err, items) {
      t.deepEqual(items, [book2])
      end()
    })

    db.by(['author.name', 'price'], function(err, items) {
      t.deepEqual(items, [book2, book1, book3])
      end()
    })

    db.by('price', function(err, items) {
      t.deepEqual(items, [book2, book3, book1])
      end()
    })

    function testHook() {
      db.index('custom').post(function(op){
        t.equal(op.type, 'del')
        t.deepEqual(op.key, [1, book3.title])
      })

      db.del(book3.title)
    }
  };

})
