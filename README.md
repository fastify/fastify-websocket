# fastify-websocket
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat)](http://standardjs.com/)  [![Build Status](https://travis-ci.org/fastify/fastify-websocket.svg?branch=master)](https://travis-ci.org/fastify/fastify-websocket) [![Greenkeeper badge](https://badges.greenkeeper.io/fastify/fastify-websocket.svg)](https://greenkeeper.io/)

WebSocket support for [Fastify](https://github.com/fastify/fastify).
Built upon [websocket-stream](http://npm.im/websocket-stream).

## Install

```
npm install fastify-websocket --save
```

## Usage

All you need to do is to add it to your project with `register` and you are done!

### Example

```js
'use strict'

const fastify = require('fastify')()

const wssOtions = {
  maxPayload: 1048576, // we set the maximum allowed messages size to 1 MiB (1024 bytes * 1024 bytes)
  path: '/fastify', // we accept only connections matching this path e.g.: ws://localhost:3000/fastify
  verifyClient: function (info, next) {
    if (info.req.headers['x-fastify-header'] !== 'fastify is awesome !') {
      return next(false) // the connection is not allowed
    }

    next(true) // the connection is allowed
  }
}

fastify.register(require('fastify-websocket'), {
  handle,
  options: wssOptions
})

function handle (conn) {
  conn.pipe(conn) // creates an echo server
}

fastify.listen(3000, (err) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
})
```

## Options :
`fastify-websocket` accept the same options as [`websocket-stream`](https://github.com/maxogden/websocket-stream#options) and as [`ws`](https://github.com/websockets/ws/blob/master/doc/ws.md#new-websocketserveroptions-callback) :

- `objectMode` - Send each chunk on its own, and do not try to pack them in a single websocket frame.
- `host` - The hostname where to bind the server.
- `port` - The port where to bind the server.
- `backlog` - The maximum length of the queue of pending connections.
- `server` - A pre-created Node.js HTTP/S server.
- `verifyClient` - A function which can be used to validate incoming connections.
- `handleProtocols` - A function which can be used to handle the WebSocket subprotocols.
- `path` - Accept only connections matching this path.
- `noServer` - Enable no server mode.
- `clientTracking` - Specifies whether or not to track clients.
- `perMessageDeflate` - Enable/disable permessage-deflate.
- `maxPayload` - The maximum allowed message size in bytes.

For more informations you can check [`ws` options documentation](https://github.com/websockets/ws/blob/master/doc/ws.md#new-websocketserveroptions-callback) and [`websocket-stream` options documentation](https://github.com/maxogden/websocket-stream#options).

_**NB:** By default if you do not provide a `server` option `fastify-websocket` will bind your websocket server instance to the scoped `fastify` instance._

## TODO

* [ ] Support Hooks?

## Acknowledgements

This project is kindly sponsored by [nearForm](http://nearform.com).

## License

Licensed under [MIT](./LICENSE).
