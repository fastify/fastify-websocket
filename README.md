# @fastify/websocket

[![CI](https://github.com/fastify/fastify-websocket/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/fastify/fastify-websocket/actions/workflows/ci.yml)
[![NPM version](https://img.shields.io/npm/v/@fastify/websocket.svg?style=flat)](https://www.npmjs.com/package/@fastify/websocket)
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat)](https://standardjs.com/)

WebSocket support for [Fastify](https://github.com/fastify/fastify).
Built upon [ws@8](https://www.npmjs.com/package/ws).

## Install

```shell
npm i @fastify/websocket
# or
yarn add @fastify/websocket
```

If you're a TypeScript user, this package has its own TypeScript types built in, but you will also need to install the types for the `ws` package:

```shell
npm i @types/ws -D
# or
yarn add -D @types/ws
```

If you use TypeScript and Yarn 2, you'll need to add a `packageExtension` to your `.yarnrc.yml` file:

```yaml
packageExtensions:
  "@fastify/websocket@*":
    peerDependencies:
      fastify: "*"
```

## Usage

After registering this plugin, you can choose on which routes the WS server will respond. This can be achieved by adding `websocket: true` property to `routeOptions` on a fastify's `.get` route. In this case, two arguments will be passed to the handler, the socket connection, and the `fastify` request object:

```js
'use strict'

const fastify = require('fastify')()
fastify.register(require('@fastify/websocket'))
fastify.register(async function (fastify) {
  fastify.get('/', { websocket: true }, (socket /* WebSocket */, req /* FastifyRequest */) => {
    socket.on('message', message => {
      // message.toString() === 'hi from client'
      socket.send('hi from server')
    })
  })
})

fastify.listen({ port: 3000 }, err => {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
})
```

In this case, it will respond with a 404 error on every unregistered route, closing the incoming upgrade connection requests.

However, you can still define a wildcard route, that will be used as the default handler:

```js
'use strict'

const fastify = require('fastify')()

fastify.register(require('@fastify/websocket'), {
  options: { maxPayload: 1048576 }
})

fastify.register(async function (fastify) {
  fastify.get('/*', { websocket: true }, (socket /* WebSocket */, req /* FastifyRequest */) => {
    socket.on('message', message => {
      // message.toString() === 'hi from client'
      socket.send('hi from wildcard route')
    })
  })

  fastify.get('/', { websocket: true }, (socket /* WebSocket */, req /* FastifyRequest */) => {
    socket.on('message', message => {
      // message.toString() === 'hi from client'
      socket.send('hi from server')
    })
  })
})

fastify.listen({ port: 3000 }, err => {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
})
```

### Attaching event handlers
Websocket route handlers must attach event handlers synchronously during handler execution to avoid accidentally dropping messages. If you want to do any async work in your websocket handler, say to authenticate a user or load data from a datastore, ensure you attach any `on('message')` handlers *before* you trigger this async work. Otherwise, messages might arrive whilst this async work is underway, and if there is no handler listening for this data it will be silently dropped.

Here is an example of how to attach message handlers synchronously while still accessing asynchronous resources. We store a promise for the async thing in a local variable, attach the message handler synchronously, and then make the message handler itself asynchronous to grab the async data and do some processing:

```javascript
fastify.get('/*', { websocket: true }, (socket, request) => {
  const sessionPromise = request.getSession() // example async session getter, called synchronously to return a promise

  socket.on('message', async (message) => {
    const session = await sessionPromise()
    // do something with the message and session
  })
})
```
### Using hooks

Routes registered with `@fastify/websocket` respect the Fastify plugin encapsulation contexts, and so will run any hooks that have been registered. This means the same route hooks you might use for authentication or error handling of plain old HTTP handlers will apply to websocket handlers as well.

```js
fastify.addHook('preValidation', async (request, reply) => {
  // check if the request is authenticated
  if (!request.isAuthenticated()) {
    await reply.code(401).send("not authenticated");
  }
})
fastify.get('/', { websocket: true }, (socket, req) => {
  // the connection will only be opened for authenticated incoming requests
  socket.on('message', message => {
    // ...
  })
})
```

**NB**
This plugin uses the same router as the `fastify` instance, this has a few implications to take into account:
- Websocket route handlers follow the usual `fastify` request lifecycle, which means hooks, error handlers, and decorators all work the same way as other route handlers.
- You can access the fastify server via `this` in your handlers
- When using `@fastify/websocket`, it needs to be registered before all routes in order to be able to intercept websocket connections to existing routes and close the connection on non-websocket routes.

```js
import Fastify from 'fastify'
import websocket from '@fastify/websocket'

const fastify = Fastify()
await fastify.register(websocket)

fastify.get('/', { websocket: true }, function wsHandler (socket, req) {
  // bound to fastify server
  this.myDecoration.someFunc()

  socket.on('message', message => {
    // message.toString() === 'hi from client'
    socket.send('hi from server')
  })
})

await fastify.listen({ port: 3000 })
```

If you need to handle both HTTP requests and incoming socket connections on the same route, you can still do it using the [full declaration syntax](https://fastify.dev/docs/latest/Reference/Routes/#full-declaration), adding a `wsHandler` property.

```js
'use strict'

const fastify = require('fastify')()

function handle (socket, req) {
  socket.on('message', (data) => socket.send(data)) // creates an echo server
}

fastify.register(require('@fastify/websocket'), {
  handle,
  options: { maxPayload: 1048576 }
})

fastify.register(async function () {
  fastify.route({
    method: 'GET',
    url: '/hello',
    handler: (req, reply) => {
      // this will handle http requests
      reply.send({ hello: 'world' })
    },
    wsHandler: (socket, req) => {
      // this will handle websockets connections
      socket.send('hello client')

      socket.once('message', chunk => {
        socket.close()
      })
    }
  })
})

fastify.listen({ port: 3000 }, err => {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
})
```

### Custom error handler:

You can optionally provide a custom `errorHandler` that will be used to handle any cleaning up of established websocket connections. The `errorHandler` will be called if any errors are thrown by your websocket route handler after the connection has been established. Note that neither Fastify's `onError` hook or functions registered with `fastify.setErrorHandler` will be called for errors thrown during a websocket request handler.

Neither the `errorHandler` passed to this plugin or fastify's `onError` hook will be called for errors encountered during message processing for your connection. If you want to handle unexpected errors within your `message` event handlers, you'll need to use your own `try { } catch {}` statements and decide what to send back over the websocket.

```js
const fastify = require('fastify')()

fastify.register(require('@fastify/websocket'), {
  errorHandler: function (error, socket /* WebSocket */, req /* FastifyRequest */, reply /* FastifyReply */) {
    // Do stuff
    // destroy/close connection
    socket.terminate()
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

fastify.get('/', { websocket: true }, (socket /* WebSocket */, req /* FastifyRequest */) => {
  socket.on('message', message => {
    // message.toString() === 'hi from client'
    socket.send('hi from server')
  })
})

fastify.listen({ port: 3000 }, err => {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
})
```

Note: Fastify's `onError` and error handlers registered by `setErrorHandler` will still be called for errors encountered *before* the websocket connection is established. This means errors thrown by `onRequest` hooks, `preValidation` handlers, and hooks registered by plugins will use the normal error handling mechanisms in Fastify. Once the websocket is established and your websocket route handler is called, `fastify-websocket`'s `errorHandler` takes over.

### Custom preClose hook:

By default, all ws connections are closed when the server closes. If you wish to modify this behavior, you can pass your own `preClose` function.

Note that `preClose` is responsible for closing all connections and closing the websocket server.

```js
const fastify = require('fastify')()

fastify.register(require('@fastify/websocket'), {
  preClose: (done) => { // Note: can also use async style, without done-callback
    const server = this.websocketServer

    for (const socket of server.clients) {
      socket.close(1001, 'WS server is going offline in custom manner, sending a code + message')
    }

    server.close(done)
  }
})
```

### Testing

Testing the ws handler can be quite tricky, luckily `fastify-websocket` decorates fastify instance with `injectWS`,
which allows easy testing of a websocket endpoint.

The signature of injectWS is the following: `([path], [upgradeContext])`.


### Creating a stream from the WebSocket

```js
const Fastify = require('fastify')
const FastifyWebSocket = require('@fastify/websocket')
const ws = require('ws')

const fastify = Fastify()
await fastify.register(FastifyWebSocket)

fastify.get('/', { websocket: true }, (socket, req) => {
  const stream = ws.createWebSocketStream(socket, { /* options */ })
  stream.setEncoding('utf8')
  stream.write('hello client')

  stream.on('data', function (data) {
    // Make sure to set up a data handler or read all the incoming
    // data in another way, otherwise stream backpressure will cause
    // the underlying WebSocket object to get paused.
  })
})

await fastify.listen({ port: 3000 })
```

#### App.js

```js
'use strict'

const Fastify = require('fastify')
const FastifyWebSocket = require('@fastify/websocket')

const App = Fastify()

App.register(FastifyWebSocket);

App.register(async function(fastify) {
  fastify.addHook('preValidation', async (request, reply) => {
    if (request.headers['api-key'] !== 'some-random-key') {
      return reply.code(401).send()
    }
  })

  fastify.get('/', { websocket: true }, (socket) => {
    socket.on('message', message => {
      socket.send('hi from server')
    })
  })
})

module.exports = App
```

#### App.test.js

```js
'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const App = require('./app.js')

test('connect to /', async (t) => {
  t.plan(1)

  const fastify = Fastify()
  fastify.register(App)
  t.teardown(fastify.close.bind(fastify))
  await fastify.ready()

  const ws = await fastify.injectWS('/', {headers: { "api-key" : "some-random-key" }})
  let resolve;
  const promise = new Promise(r => { resolve = r })

  ws.on('message', (data) => {
    resolve(data.toString());
  })
  ws.send('hi from client')

  t.assert(await promise, 'hi from server')
  // Remember to close the ws at the end
  ws.terminate()
})
```

#### Things to know
- Websocket needs to be closed manually at the end of each test.
- `fastify.ready()` needs to be awaited to ensure that fastify has been decorated.
- You need to register the event listener before sending the message if you need to process the server response.

## Options

`@fastify/websocket` accept these options for [`ws`](https://github.com/websockets/ws/blob/master/doc/ws.md#new-websocketserveroptions-callback) :

- `host` - The hostname where to bind the server.
- `port` - The port where to bind the server.
- `backlog` - The maximum length of the queue of pending connections.
- `server` - A pre-created Node.js HTTP/S server.
- `verifyClient` - A function that can be used to validate incoming connections.
- `handleProtocols` - A function that can be used to handle the WebSocket subprotocols.
- `clientTracking` - Specifies whether or not to track clients.
- `perMessageDeflate` - Enable/disable permessage-deflate.
- `maxPayload` - The maximum allowed message size in bytes.

For more information, you can check [`ws` options documentation](https://github.com/websockets/ws/blob/master/doc/ws.md#new-websocketserveroptions-callback).

_**NB** By default if you do not provide a `server` option `@fastify/websocket` will bind your websocket server instance to the scoped `fastify` instance._

_**NB** The `path` option from `ws` should not be provided since the routing is handled by fastify itself_

_**NB** The `noServer` option from `ws` should not be provided since the point of @fastify/websocket is to listen on the fastify server. If you want a custom server, you can use the `server` option, and if you want more control, you can use the `ws` library directly_

[ws](https://github.com/websockets/ws) does not allow you to set `objectMode` or `writableObjectMode` to true
## Acknowledgments

This project is kindly sponsored by [nearForm](https://nearform.com).

## License

Licensed under [MIT](./LICENSE).
