# fastify-websocket

[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat)](http://standardjs.com/)
![CI
workflow](https://github.com/fastify/fastify-websocket/workflows/CI%20workflow/badge.svg)

WebSocket support for [Fastify](https://github.com/fastify/fastify).
Built upon [ws](https://www.npmjs.com/package/ws).

## Install

```
npm install fastify-websocket --save
```

## Usage

There are two possible ways of using this plugin: with a **global handler** or with a **per route handler**.

### Global handler

All you need to do is to add it to your project with `register` and pass handle function. You are done!

```js
'use strict'

const fastify = require('fastify')()

fastify.register(require('fastify-websocket'), {
  handle,
  options: {
    maxPayload: 1048576, // we set the maximum allowed messages size to 1 MiB (1024 bytes * 1024 bytes)
    path: '/fastify', // we accept only connections matching this path e.g.: ws://localhost:3000/fastify
    verifyClient: function (info, next) {
      if (info.req.headers['x-fastify-header'] !== 'fastify is awesome !') {
        return next(false) // the connection is not allowed
      }
      next(true) // the connection is allowed
    }
  }
})

function handle (conn) {
  conn.pipe(conn) // creates an echo server
}

fastify.listen(3000, err => {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
})
```

### Per route handler

After registering this plugin, you can choose on which routes the WS server will respond. This could be achieved by adding `websocket: true` property to `routeOptions` on a fastify's `.get` route. In this case two arguments will be passed to the handler: socket connection and the original `http.IncomingMessage` (instead of the usual fastify's request and reply objects).

```js
'use strict'

const fastify = Fastify()

fastify.register(require('fastify-websocket'))

fastify.get('/', { websocket: true }, (connection, req) => {
  connection.socket.on('message', message => {
    // message === 'hi from client'
    connection.socket.send('hi from server')
  })
})

fastify.listen(3000, err => {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
})
```

In this case there won't be any global handler, so it will respond with a 404 error on every unregistered route, closing the incoming upgrade connection requests.

The route handler receives route params as a third argument:

```js
fastify.get('/ws/:id', { websocket: true }, (connection, req, params) => {
  connection.write(`hi on stream ${params.id}`)
})
```

However you can still pass a default global handler, that will be used as default handler.

```js
'use strict'

const fastify = require('fastify')()

function handle (conn) {
  conn.pipe(conn) // creates an echo server
}

fastify.register(require('fastify-websocket'), {
  handle,
  options: { maxPayload: 1048576 }
})

fastify.get('/', { websocket: true }, (connection, req) => {
  connection.socket.on('message', message => {
    // message === 'hi from client'
    connection.socket.send('hi from server')
  })
})

fastify.listen(3000, err => {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
})
```

_**NB:** Websocket handlers don't follow the usual `fastify` request lifecycle, they are handled by an independent router. You can still access the fastify server's decorations via `this` in both global and per route handlers_

```js
'use strict'

const fastify = require('fastify')()

fastify.register(require('fastify-websocket'))

fastify.get('/', { websocket: true }, function wsHandler (connection, req) {
  // bound to fastify server
  this.myDecoration.someFunc()

  connection.socket.on('message', message => {
    // message === 'hi from client'
    connection.socket.send('hi from server')
  })
})

fastify.listen(3000, err => {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
})
```

If you need to handle both HTTP requests and incoming socket connections on the same route, you can still do it using the [full declaration syntax](https://www.fastify.io/docs/latest/Routes/#full-declaration), adding a `wsHandler` property.

```js
'use strict'

const fastify = require('fastify')()

function handle (conn) {
  conn.pipe(conn) // creates an echo server
}

fastify.register(require('fastify-websocket'), {
  handle,
  options: { maxPayload: 1048576 }
})

fastify.route({
  method: 'GET',
  url: '/hello',
  handler: (req, reply) => {
    // this will handle http requests
    reply.send({ hello: 'world' })
  },
  wsHandler: (conn, req) => {
    // this will handle websockets connections
    conn.setEncoding('utf8')
    conn.write('hello client')

    conn.once('data', chunk => {
      conn.end()
    })
  }
})

fastify.listen(3000, err => {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
})
```

## Options :

`fastify-websocket` accept the same options as [`ws`](https://github.com/websockets/ws/blob/master/doc/ws.md#new-websocketserveroptions-callback) :

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

For more informations you can check [`ws` options documentation](https://github.com/websockets/ws/blob/master/doc/ws.md#new-websocketserveroptions-callback).

_**NB:** By default if you do not provide a `server` option `fastify-websocket` will bind your websocket server instance to the scoped `fastify` instance._

## Acknowledgements

This project is kindly sponsored by [nearForm](http://nearform.com).

## License

Licensed under [MIT](./LICENSE).
