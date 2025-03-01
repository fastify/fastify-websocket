'use strict'

const http = require('node:http')
const split = require('split2')
const { test } = require('node:test')
const Fastify = require('fastify')
const fastifyWebsocket = require('..')
const WebSocket = require('ws')
const { once, on } = require('node:events')
let timersPromises

try {
  timersPromises = require('node:timers/promises')
} catch {}

test('Should expose a websocket', async (t) => {
  t.plan(2)

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(fastifyWebsocket)

  fastify.get('/', { websocket: true }, (socket) => {
    t.after(() => socket.terminate())

    socket.once('message', (chunk) => {
      t.assert.deepStrictEqual(chunk.toString(), 'hello server')
      socket.send('hello client')
    })
  })

  await fastify.listen({ port: 0 })

  const ws = new WebSocket('ws://localhost:' + fastify.server.address().port)
  t.after(() => {
    if (ws.readyState) {
      ws.close()
    }
  })

  const chunkPromise = once(ws, 'message')
  await once(ws, 'open')
  ws.send('hello server')

  const [chunk] = await chunkPromise
  t.assert.deepStrictEqual(chunk.toString(), 'hello client')
  ws.close()
})

test('Should fail if custom errorHandler is not a function', async (t) => {
  t.plan(2)

  const fastify = Fastify()
  t.after(() => fastify.close())

  try {
    await fastify.register(fastifyWebsocket, { errorHandler: {} })
  } catch (err) {
    t.assert.deepStrictEqual(err.message, 'invalid errorHandler function')
  }

  fastify.get('/', { websocket: true }, (socket) => {
    t.after(() => socket.terminate())
  })

  try {
    await fastify.listen({ port: 0 })
  } catch (err) {
    t.assert.deepStrictEqual(err.message, 'invalid errorHandler function')
  }
})

test('Should run custom errorHandler on wildcard route handler error', async (t) => {
  t.plan(1)

  const fastify = Fastify()
  t.after(() => fastify.close())

  let _resolve
  const p = new Promise((resolve) => {
    _resolve = resolve
  })

  await fastify.register(fastifyWebsocket, {
    errorHandler: function (error) {
      t.assert.deepStrictEqual(error.message, 'Fail')
      _resolve()
    }
  })

  fastify.get('/*', { websocket: true }, (socket) => {
    socket.on('message', (data) => socket.send(data))
    t.after(() => socket.terminate())
    return Promise.reject(new Error('Fail'))
  })

  await fastify.listen({ port: 0 })

  const ws = new WebSocket('ws://localhost:' + fastify.server.address().port)
  t.after(() => {
    if (ws.readyState) {
      ws.close()
    }
  })

  await p
})

test('Should run custom errorHandler on error inside websocket handler', async (t) => {
  t.plan(1)

  const fastify = Fastify()
  t.after(() => fastify.close())

  let _resolve
  const p = new Promise((resolve) => {
    _resolve = resolve
  })

  const options = {
    errorHandler: function (error) {
      t.assert.deepStrictEqual(error.message, 'Fail')
      _resolve()
    }
  }

  await fastify.register(fastifyWebsocket, options)

  fastify.get('/', { websocket: true }, function wsHandler (socket) {
    socket.on('message', (data) => socket.send(data))
    t.after(() => socket.terminate())
    throw new Error('Fail')
  })

  await fastify.listen({ port: 0 })
  const ws = new WebSocket('ws://localhost:' + fastify.server.address().port)

  t.after(() => {
    if (ws.readyState) {
      ws.close()
    }
  })

  await p
})

test('Should run custom errorHandler on error inside async websocket handler', async (t) => {
  t.plan(1)

  const fastify = Fastify()
  t.after(() => fastify.close())

  let _resolve
  const p = new Promise((resolve) => {
    _resolve = resolve
  })

  const options = {
    errorHandler: function (error) {
      t.assert.deepStrictEqual(error.message, 'Fail')
      _resolve()
    }
  }

  await fastify.register(fastifyWebsocket, options)

  fastify.get('/', { websocket: true }, async function wsHandler (socket) {
    socket.on('message', (data) => socket.send(data))
    t.after(() => socket.terminate())
    throw new Error('Fail')
  })

  await fastify.listen({ port: 0 })
  const ws = new WebSocket('ws://localhost:' + fastify.server.address().port)
  t.after(() => {
    if (ws.readyState) {
      ws.close()
    }
  })

  await p
})

test('Should be able to pass custom options to ws', async (t) => {
  t.plan(2)

  const fastify = Fastify()
  t.after(() => fastify.close())

  const options = {
    verifyClient: function (info) {
      t.assert.deepStrictEqual(info.req.headers['x-custom-header'], 'fastify is awesome !')

      return true
    }
  }

  await fastify.register(fastifyWebsocket, { options })

  fastify.get('/*', { websocket: true }, (socket) => {
    socket.on('message', (data) => socket.send(data))
    t.after(() => socket.terminate())
  })

  await fastify.listen({ port: 0 })

  const clientOptions = { headers: { 'x-custom-header': 'fastify is awesome !' } }
  const ws = new WebSocket('ws://localhost:' + fastify.server.address().port, clientOptions)
  const chunkPromise = once(ws, 'message')
  await once(ws, 'open')
  t.after(() => {
    if (ws.readyState) {
      ws.close()
    }
  })

  ws.send('hello')

  const [chunk] = await chunkPromise
  t.assert.deepStrictEqual(chunk.toString(), 'hello')
  ws.close()
})

test('Should warn if path option is provided to ws', async (t) => {
  t.plan(3)
  const logStream = split(JSON.parse)
  const fastify = Fastify({
    logger: {
      stream: logStream,
      level: 'warn'
    }
  })

  logStream.once('data', line => {
    t.assert.deepStrictEqual(line.msg, 'ws server path option shouldn\'t be provided, use a route instead')
    t.assert.deepStrictEqual(line.level, 40)
  })

  t.after(() => fastify.close())

  const options = { path: '/' }
  await fastify.register(fastifyWebsocket, { options })

  fastify.get('/*', { websocket: true }, (socket) => {
    socket.on('message', (data) => socket.send(data))
    t.after(() => socket.terminate())
  })

  await fastify.listen({ port: 0 })

  const clientOptions = { headers: { 'x-custom-header': 'fastify is awesome !' } }
  const ws = new WebSocket('ws://localhost:' + fastify.server.address().port, clientOptions)
  const chunkPromise = once(ws, 'message')
  await once(ws, 'open')
  t.after(() => {
    if (ws.readyState) {
      ws.close()
    }
  })

  ws.send('hello')

  const [chunk] = await chunkPromise
  t.assert.deepStrictEqual(chunk.toString(), 'hello')
  ws.close()
})

test('Should be able to pass a custom server option to ws', async (t) => {
  // We create an external server
  const externalServerPort = 3000
  const externalServer = http
    .createServer()
    .on('connection', (socket) => {
      socket.unref()
    })
    .listen(externalServerPort, 'localhost')

  const fastify = Fastify()
  t.after(() => {
    externalServer.close()
    fastify.close()
  })

  const options = {
    server: externalServer
  }

  await fastify.register(fastifyWebsocket, { options })

  fastify.get('/', { websocket: true }, (socket) => {
    socket.on('message', (data) => socket.send(data))
    t.after(() => socket.terminate())
  })

  await fastify.ready()

  const ws = new WebSocket('ws://localhost:' + externalServerPort)
  const chunkPromise = once(ws, 'message')
  await once(ws, 'open')
  t.after(() => {
    if (ws.readyState) {
      ws.close()
    }
  })

  ws.send('hello')

  const [chunk] = await chunkPromise
  t.assert.deepStrictEqual(chunk.toString(), 'hello')
  ws.close()
})

test('Should be able to pass clientTracking option in false to ws', async (t) => {
  const fastify = Fastify()

  const options = {
    clientTracking: false
  }

  fastify.register(fastifyWebsocket, { options })

  fastify.get('/*', { websocket: true }, (socket) => {
    socket.close()
  })

  await fastify.listen({ port: 0 })

  await fastify.close()
})

test('Should be able to pass preClose option to override default', async (t) => {
  t.plan(3)

  const fastify = Fastify()

  const preClose = (done) => {
    t.assert.ok('Custom preclose successfully called')

    for (const connection of fastify.websocketServer.clients) {
      connection.close()
    }
    done()
  }

  await fastify.register(fastifyWebsocket, { preClose })

  fastify.get('/', { websocket: true }, (socket) => {
    t.after(() => socket.terminate())

    socket.once('message', (chunk) => {
      t.assert.deepStrictEqual(chunk.toString(), 'hello server')
      socket.send('hello client')
    })
  })

  await fastify.listen({ port: 0 })

  const ws = new WebSocket('ws://localhost:' + fastify.server.address().port)
  t.after(() => {
    if (ws.readyState) {
      ws.close()
    }
  })

  const chunkPromise = once(ws, 'message')
  await once(ws, 'open')
  ws.send('hello server')

  const [chunk] = await chunkPromise
  t.assert.deepStrictEqual(chunk.toString(), 'hello client')
  ws.close()

  await fastify.close()
})

test('Should fail if custom preClose is not a function', async (t) => {
  t.plan(2)

  const fastify = Fastify()
  t.after(() => fastify.close())

  const preClose = 'Not a function'

  try {
    await fastify.register(fastifyWebsocket, { preClose })
  } catch (err) {
    t.assert.deepStrictEqual(err.message, 'invalid preClose function')
  }

  fastify.get('/', { websocket: true }, (socket) => {
    t.after(() => socket.terminate())
  })

  try {
    await fastify.listen({ port: 0 })
  } catch (err) {
    t.assert.deepStrictEqual(err.message, 'invalid preClose function')
  }
})

test('Should gracefully close with a connected client', async (t) => {
  t.plan(2)

  const fastify = Fastify()

  await fastify.register(fastifyWebsocket)
  let serverConnEnded

  fastify.get('/', { websocket: true }, (socket) => {
    socket.send('hello client')

    socket.once('message', (chunk) => {
      t.assert.deepStrictEqual(chunk.toString(), 'hello server')
    })

    serverConnEnded = once(socket, 'close')
    // this connection stays alive untile we close the server
  })

  await fastify.listen({ port: 0 })

  const ws = new WebSocket('ws://localhost:' + fastify.server.address().port)
  const chunkPromise = once(ws, 'message')
  await once(ws, 'open')
  ws.send('hello server')

  const ended = once(ws, 'close')
  const [chunk] = await chunkPromise
  t.assert.deepStrictEqual(chunk.toString(), 'hello client')
  await fastify.close()
  await ended
  await serverConnEnded
})

test('Should gracefully close when clients attempt to connect after calling close', async (t) => {
  t.plan(3)

  const fastify = Fastify()

  const oldClose = fastify.server.close
  let p
  fastify.server.close = function (cb) {
    const ws = new WebSocket('ws://localhost:' + fastify.server.address().port)

    p = once(ws, 'close').catch((err) => {
      t.assert.deepStrictEqual(err.message, 'Unexpected server response: 503')
      oldClose.call(this, cb)
    })
  }

  await fastify.register(fastifyWebsocket)

  fastify.get('/', { websocket: true }, (socket) => {
    t.assert.ok('received client connection')
    socket.close()
    // this connection stays alive until we close the server
  })

  await fastify.listen({ port: 0 })

  const ws = new WebSocket('ws://localhost:' + fastify.server.address().port)

  ws.on('close', () => {
    t.assert.ok('client 1 closed')
  })

  await once(ws, 'open')
  await fastify.close()
  await p
})

/*
  This test sends one message every 10 ms.
  After 50 messages have been sent, we check how many unhandled messages the server has.
  After 100 messages we check this number has not increased but rather decreased
  the number of unhandled messages below a threshold, which means it is still able
  to process message.
*/
test('Should keep accepting connection', { skip: !timersPromises }, async t => {
  t.plan(1)

  const fastify = Fastify()
  let sent = 0
  let unhandled = 0
  let threshold = 0

  await fastify.register(fastifyWebsocket)

  fastify.get('/', { websocket: true }, (socket) => {
    socket.on('message', () => {
      unhandled--
    })

    socket.on('error', err => {
      t.error(err)
    })

    /*
      This is a safety check - If the socket is stuck, fastify.close will not run.
      Therefore after 100 messages we forcibly close the socket.
    */
    const safetyInterval = setInterval(() => {
      if (sent < 100) {
        return
      }

      clearInterval(safetyInterval)
      socket.terminate()
    }, 100)
  })

  await fastify.listen({ port: 0 })

  // Setup a client that sends a lot of messages to the server
  const client = new WebSocket('ws://localhost:' + fastify.server.address().port)
  client.on('error', console.error)

  await once(client, 'open')
  const message = Buffer.alloc(1024, Date.now())

  /* eslint-disable no-unused-vars */
  for await (const _ of timersPromises.setInterval(10)) {
    client.send(message.toString(), 10)
    sent++
    unhandled++
    if (sent === 50) {
      threshold = unhandled
    } else if (sent === 100) {
      await fastify.close()
      t.assert.ok(unhandled <= threshold)
      break
    }
  }
})

test('Should keep processing message when many medium sized messages are sent', async t => {
  t.plan(1)

  const fastify = Fastify()
  const total = 200
  let handled = 0

  await fastify.register(fastifyWebsocket)

  fastify.get('/', { websocket: true }, (socket) => {
    socket.on('message', () => {
      socket.send('handled')
    })

    socket.on('error', err => {
      t.error(err)
    })
  })

  await fastify.listen({ port: 0 })

  // Setup a client that sends a lot of messages to the server
  const client = new WebSocket('ws://localhost:' + fastify.server.address().port)
  client.on('error', console.error)

  await once(client, 'open')

  for (let i = 0; i < total; i++) {
    client.send(Buffer.alloc(160, `${i}`).toString('utf-8'))
  }

  /* eslint-disable no-unused-vars */
  for await (const _ of on(client, 'message')) {
    handled++

    if (handled === total) {
      break
    }
  }

  await fastify.close()
  t.assert.deepStrictEqual(handled, total)
})

test('Should error server if the noServer option is set', (t) => {
  t.plan(1)
  const fastify = Fastify()

  fastify.register(fastifyWebsocket, { options: { noServer: true } })
  t.assert.rejects(fastify.ready())
})

test('Should preserve the prefix in non-websocket routes', async (t) => {
  t.plan(2)

  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(async function (fastify) {
    t.assert.deepStrictEqual(fastify.prefix, '/hello')
    fastify.get('/', function (_, reply) {
      t.assert.deepStrictEqual(this.prefix, '/hello')
      reply.send('hello')
    })
  }, { prefix: '/hello' })

  await fastify.inject('/hello')
})

test('Should Handle WebSocket errors to avoid Node.js crashes', async t => {
  t.plan(1)

  const fastify = Fastify()
  await fastify.register(fastifyWebsocket)

  fastify.get('/', { websocket: true }, (socket) => {
    socket.on('error', err => {
      t.assert.deepStrictEqual(err.code, 'WS_ERR_UNEXPECTED_RSV_2_3')
    })
  })

  await fastify.listen({ port: 0 })

  const client = new WebSocket('ws://localhost:' + fastify.server.address().port)
  await once(client, 'open')

  client._socket.write(Buffer.from([0xa2, 0x00]))

  await fastify.close()
})

test('remove all others websocket handlers on close', async (t) => {
  const fastify = Fastify()

  await fastify.register(fastifyWebsocket)

  await fastify.listen({ port: 0 })

  await fastify.close()

  t.assert.deepStrictEqual(fastify.server.listeners('upgrade').length, 0)
})

test('clashing upgrade handler', async (t) => {
  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.server.on('upgrade', (req, socket) => {
    const res = new http.ServerResponse(req)
    res.assignSocket(socket)
    res.end()
    socket.destroy()
  })

  await fastify.register(fastifyWebsocket)

  fastify.get('/', { websocket: true }, () => {
    t.assert.fail('this should never be invoked')
  })

  await fastify.listen({ port: 0 })

  const ws = new WebSocket('ws://localhost:' + fastify.server.address().port)
  await once(ws, 'error')
})
