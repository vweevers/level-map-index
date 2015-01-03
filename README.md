# level-map-index

> Another indexing solution for leveldb. Adapted from [map-reduce](https://github.com/dominictarr/map-reduce).
The API is unstable because this module is a by-product of refactoring an ugly ORM.

[![npm status](http://img.shields.io/npm/v/level-map-index.svg?style=flat-square)](https://www.npmjs.org/package/level-map-index) [![Stability](http://img.shields.io/badge/stability-experimental-orange.svg?style=flat-square)](http://nodejs.org/api/documentation.html#documentation_stability_index) [![Travis build status](https://img.shields.io/travis/vweevers/level-map-index.svg?style=flat-square&label=travis)](http://travis-ci.org/vweevers/level-map-index) [![AppVeyor build status](https://img.shields.io/appveyor/ci/vweevers/level-map-index.svg?style=flat-square&label=appveyor)](https://ci.appveyor.com/project/vweevers/level-map-index) [![Dependency status](https://img.shields.io/david/vweevers/level-map-index.svg?style=flat-square)](https://david-dm.org/vweevers/level-map-index)

Jump to: [api](#api) / [install](#install) / [license](#license)

## examples

```js
// create your database
var sublevel = require('level-sublevel')
  , level = require('levelup')
  , db = sublevel(level('./data'), {valueEncoding: 'json'})

// install
require('level-map-index')(db)

// create indices
db.index('title')
db.index(['author.name', 'price'])

// a custom index (should return an array)
db.index('custom', function map(key, value){
  return [value.title.indexOf('f')]
})

var author = { name: 'bob' }
var book   = { title: 'foo', price: 10, author: author }

db.put('foo', book, search)

function search() {
  // streams will wait for indexing to complete

  // every book by bob, ordered by price
  db.streamBy(['author.name', 'price'], 'bob').pipe(somewhere)

  // every book by bob with a price of 10
  db.streamBy(['author.name', 'price'], ['bob', 10]).pipe(somewhere)

  // ordered by title
  db.streamBy('title').pipe(somewhere)

  // use sublevel hooks
  db.index('custom').post(function(op){
    // op.key is the array we returned from our `map` fn above
    if (op.type=='del' && op.key[0]===0) {
      console.log('no more titles starting with "f" in our db')
    }
  })

  // this will (eventually) trigger the above post hook
  db.del('a')
}
```

## api

### `index (db, [opts || fn])`

Install the plugin.

### `db.index(props, [opts || fn])`

Create an index.

### `db.streamBy(props, [range, opts])`

Likely to change, no docs yet.

### `db.by(props, [range, opts], cb)`

### `db.getBy(props, [range, opts], cb)`

### `db.hasIndex(props)`

### `index.start()`

Manually trigger a rebuild. A `complete` event fires when it's done.

## install

With [npm](https://npmjs.org) do:

```
npm install level-map-index
```

## license

[MIT](http://opensource.org/licenses/MIT) © [Dominic Tarr](http://bit.ly/dominictarr), [Vincent Weevers](http://vincentweevers.nl)
