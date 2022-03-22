# fastify-websocket

![CI](https://github.com/fastify/fastify-websocket/workflows/CI/badge.svg)
[![NPM version](https://img.shields.io/npm/v/fastify-websocket.svg?style=flat)](https://www.npmjs.com/package/fastify-websocket)
[![Known Vulnerabilities](https://snyk.io/test/github/fastify/fastify-websocket/badge.svg)](https://snyk.io/test/github/fastify/fastify-websocket)
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat)](https://standardjs.com/)

WebSocket support for [Fastify](https://github.com/fastify/fastify).
Built upon [ws@8](https://www.npmjs.com/package/ws).

## Install

```shell
npm install fastify-websocket --save
# or 
yarn add fastify-websocket
```

If you're a TypeScript user, this package has its own TypeScript types built in, but you will also need to install the types for the `ws` package:

```shell
npm install @types/ws --save-dev
# or
yarn add -D @types/ws
```

## Usage

After registering this plugin, you can choose on which routes the WS server will respond. This can be achieved by adding `websocket: true` property to `routeOptions` on a fastify's `.get` route. In this case two arguments will be passed to the handler, the socket connection, and the `fastify` request object:

```js
'use strict'

const fastify = require('fastify')()
fastify.register(require('fastify-websocket'))

fastify.get('/', { websocket: true }, (connection /* SocketStream */, req /* FastifyRequest */) => {
  connection.socket.on('message', message => {
    // message.toString() === 'hi from client'
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

However, you can still define a wildcard route, that will be used as default handler:

```js
'use strict'

const fastify = require('fastify')()

fastify.register(require('fastify-websocket'), {
  options: { maxPayload: 1048576 }
})


fastify.get('/*', { websocket: true }, (connection /* SocketStream */, req /* FastifyRequest */) => {
  connection.socket.on('message', message => {
    // message.toString() === 'hi from client'
    connection.socket.send('hi from wildcard route')
  })
})

fastify.get('/', { websocket: true }, (connection /* SocketStream */, req /* FastifyRequest */) => {
  connection.socket.on('message', message => {
    // message.toString() === 'hi from client'
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

### Attaching event handlers

It is important that websocket route handlers attach event handlers synchronously during handler execution to avoid accidentally dropping messages. If you want to do any async work in your websocket handler, say to authenticate a user or load data from a datastore, ensure you attach any `on('message')` handlers *before* you trigger this async work. Otherwise, messages might arrive whilst this async work is underway, and if there is no handler listening for this data it will be silently dropped.

Here is an example of how to attach message handlers synchronously while still accessing asynchronous resources. We store a promise for the async thing in a local variable, attach the message handler synchronously, and then make the message handler itself asynchronous to grab the async data and do some processing:

```javascript
fastify.get('/*', { websocket: true }, (connection, request) => {
  const sessionPromise = request.getSession() // example async session getter, called synchronously to return a promise

  connection.socket.on('message', async (message) => {
    const session = await sessionPromise()
    // do something with the message and session
  })
})
```
### Using hooks

Routes registered with `fastify-websocket` respect the Fastify plugin encapsulation contexts, and so will run any hooks that have been registered. This means the same route hooks you might use for authentication or error handling of plain old HTTP handlers will apply to websocket handlers as well.

```js
fastify.addHook('preValidation', async (request, reply) => {
  // check if the request is authenticated
  if (!request.isAuthenticated()) {
    await reply.code(401).send("not authenticated");
  }
})
fastify.get('/', { websocket: true }, (connection, req) => {
  // the connection will only be opened for authenticated incoming requests
  connection.socket.on('message', message => {
    // ...
  })
})
```

**NB**
This plugin uses the same router as the `fastify` instance, this has a few implications to take into account:
- Websocket route handlers follow the usual `fastify` request lifecycle, which means hooks, error handlers, and decorators all work the same way as other route handlers.
- You can access the fastify server via `this` in your handlers
- When using `fastify-websocket`, it needs to be registered before all routes in order to be able to intercept websocket connections to existing routes and close the connection on non-websocket routes.

```js
'use strict'

const fastify = require('fastify')()

fastify.register(require('fastify-websocket'))

fastify.get('/', { websocket: true }, function wsHandler (connection, req) {
  // bound to fastify server
  this.myDecoration.someFunc()

  connection.socket.on('message', message => {
    // message.toString() === 'hi from client'
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
    // message.toString() === 'hi from client'
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

## Options

`fastify-websocket` accept these options for [`ws`](https://github.com/websockets/ws/blob/master/doc/ws.md#new-websocketserveroptions-callback) :

- `host` - The hostname where to bind the server.
- `port` - The port where to bind the server.
- `backlog` - The maximum length of the queue of pending connections.
- `server` - A pre-created Node.js HTTP/S server.
- `verifyClient` - A function which can be used to validate incoming connections.
- `handleProtocols` - A function which can be used to handle the WebSocket subprotocols.
- `clientTracking` - Specifies whether or not to track clients.
- `perMessageDeflate` - Enable/disable permessage-deflate.
- `maxPayload` - The maximum allowed message size in bytes.

For more information, you can check [`ws` options documentation](https://github.com/websockets/ws/blob/master/doc/ws.md#new-websocketserveroptions-callback).

_**NB** By default if you do not provide a `server` option `fastify-websocket` will bind your websocket server instance to the scoped `fastify` instance._

_**NB** The `path` option from `ws` should not be provided since the routing is handled by fastify itself_

_**NB** The `noServer` option from `ws` should not be provided since the point of fastify-websocket is to listen on the fastify server. If you want a custom server, you can use the `server` option, and if you want more control, you can use the `ws` library directly_

You can also pass the following as `connectionOptions` for [createWebSocketStream](https://github.com/websockets/ws/blob/master/doc/ws.md#createwebsocketstreamwebsocket-options).

- `allowHalfOpen` <boolean> If set to false, then the stream will automatically end the writable side when the readable side ends. Default: true.
- `readable` <boolean> Sets whether the Duplex should be readable. Default: true.
- `writable` <boolean> Sets whether the Duplex should be writable. Default: true.
- `readableObjectMode` <boolean> Sets objectMode for readable side of the stream. Has no effect if objectMode is true. Default: false.
- `readableHighWaterMark` <number> Sets highWaterMark for the readable side of the stream.
- `writableHighWaterMark` <number> Sets highWaterMark for the writable side of the stream.

[ws](https://github.com/websockets/ws) does not allow you to set `objectMode` or `writableObjectMode` to true
## Acknowledgements

This project is kindly sponsored by [nearForm](https://nearform.com).

## License

Licensed under [MIT](./LICENSE).
