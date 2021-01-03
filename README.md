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

After registering this plugin, you can choose on which routes the WS server will respond. This could be achieved by adding `websocket: true` property to `routeOptions` on a fastify's `.get` route. In this case two arguments will be passed to the handler: the socket connection and the fastify's request object.

```js
'use strict'

const fastify = Fastify()

fastify.register(require('fastify-websocket'))

fastify.get('/', { websocket: true }, (conn /* SocketStream */, req /* FastifyRequest */) => {
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

In this case, it will respond with a 404 error on every unregistered route, closing the incoming upgrade connection requests.

However you can still define a wildcard route, that will be used as default handler.

```js
'use strict'

const fastify = require('fastify')()

fastify.register(require('fastify-websocket'), {
  options: { maxPayload: 1048576 }
})


fastify.get('/*', { websocket: true }, (connection /* SocketStream */, req /* FastifyRequest */) => {
  connection.socket.on('message', message => {
    // message === 'hi from client'
    connection.socket.send('hi from wildcard route')
  })
})

fastify.get('/', { websocket: true }, (connection /* SocketStream */, req /* FastifyRequest */) => {
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
**NB:** 

This plugin uses the same router as the fastify instance, this has a few implications to take into account:
- Websocket route handlers follow the usual `fastify` request lifecycle.
- You can access the fastify server via `this` in your handlers
- You can access the fastify request decorations via the `req` object your handlers
- When using `fastify-websocket`, it needs to be registered before all routes in order to be able to intercept websocket connections to existing routes and close the connection on non-websocket routes.

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

function handle (conn, req) {
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

### Custom error handler:

You can optionally provide a custom errorHandler that will be used to handle any cleaning up: 

```js
'use strict'

const fastify = require('fastify')()

fastify.register(require('fastify-websocket'), {
  errorHandler: function (error, conn /* SocketStream */, req /* FastifyRequest */, reply /* FastifyReply */) {
    // Do stuff
    // destroy/close connection
    conn.destroy(error)
  },
  options: {
    maxPayload: 1048576, // we set the maximum allowed messages size to 1 MiB (1024 bytes * 1024 bytes)
    verifyClient: function (info, next) {
      if (info.req.headers['x-fastify-header'] !== 'fastify is awesome !') {
        return next(false) // the connection is not allowed
      }
      next(true) // the connection is allowed
    }
  }
})

fastify.get('/', { websocket: true }, (connection /* SocketStream */, req /* FastifyRequest */) => {
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

## Options :

`fastify-websocket` accept these options for [`ws`](https://github.com/websockets/ws/blob/master/doc/ws.md#new-websocketserveroptions-callback) :

- `objectMode` - Send each chunk on its own, and do not try to pack them in a single websocket frame.
- `host` - The hostname where to bind the server.
- `port` - The port where to bind the server.
- `backlog` - The maximum length of the queue of pending connections.
- `server` - A pre-created Node.js HTTP/S server.
- `verifyClient` - A function which can be used to validate incoming connections.
- `handleProtocols` - A function which can be used to handle the WebSocket subprotocols.
- `noServer` - Enable no server mode.
- `clientTracking` - Specifies whether or not to track clients.
- `perMessageDeflate` - Enable/disable permessage-deflate.
- `maxPayload` - The maximum allowed message size in bytes.

For more informations you can check [`ws` options documentation](https://github.com/websockets/ws/blob/master/doc/ws.md#new-websocketserveroptions-callback).

_**NB:** By default if you do not provide a `server` option `fastify-websocket` will bind your websocket server instance to the scoped `fastify` instance._

_**NB:** `path` option from `ws` shouldn't be provided since the routing is handled by fastify itself_

## Acknowledgements

This project is kindly sponsored by [nearForm](http://nearform.com).

## License

Licensed under [MIT](./LICENSE).
