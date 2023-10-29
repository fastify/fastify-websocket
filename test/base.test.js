'use strict'

const http = require('node:http')
const util = require('node:util')
const split = require('split2')
const test = require('tap').test
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
  t.teardown(() => fastify.close())

  await fastify.register(fastifyWebsocket)

  fastify.get('/', { websocket: true }, (connection) => {
    connection.setEncoding('utf8')
    t.teardown(() => connection.destroy())

    connection.once('data', (chunk) => {
      t.equal(chunk, 'hello server')
      connection.write('hello client')
      connection.end()
    })
  })

  await fastify.listen({ port: 0 })

  const ws = new WebSocket('ws://localhost:' + fastify.server.address().port)
  const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
  t.teardown(() => client.destroy())

  client.setEncoding('utf8')
  client.write('hello server')

  const [chunk] = await once(client, 'data')
  t.equal(chunk, 'hello client')
  client.end()
})

test('Should fail if custom errorHandler is not a function', async (t) => {
  t.plan(2)

  const fastify = Fastify()
  t.teardown(() => fastify.close())

  try {
    await fastify.register(fastifyWebsocket, { errorHandler: {} })
  } catch (err) {
    t.equal(err.message, 'invalid errorHandler function')
  }

  fastify.get('/', { websocket: true }, (connection) => {
    t.teardown(() => connection.destroy())
  })

  try {
    await fastify.listen({ port: 0 })
  } catch (err) {
    t.equal(err.message, 'invalid errorHandler function')
  }
})

test('Should run custom errorHandler on wildcard route handler error', async (t) => {
  t.plan(1)

  const fastify = Fastify()
  t.teardown(() => fastify.close())

  let _resolve
  const p = new Promise((resolve) => {
    _resolve = resolve
  })

  await fastify.register(fastifyWebsocket, {
    errorHandler: function (error) {
      t.equal(error.message, 'Fail')
      _resolve()
    }
  })

  fastify.get('/*', { websocket: true }, (conn) => {
    conn.pipe(conn)
    t.teardown(() => conn.destroy())
    return Promise.reject(new Error('Fail'))
  })

  await fastify.listen({ port: 0 })

  const ws = new WebSocket('ws://localhost:' + fastify.server.address().port)
  const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
  t.teardown(() => client.destroy())
  await p
})

test('Should run custom errorHandler on error inside websocket handler', async (t) => {
  const fastify = Fastify()
  t.teardown(() => fastify.close())

  let _resolve
  const p = new Promise((resolve) => {
    _resolve = resolve
  })

  const options = {
    errorHandler: function (error) {
      t.equal(error.message, 'Fail')
      _resolve()
    }
  }

  await fastify.register(fastifyWebsocket, options)

  fastify.get('/', { websocket: true }, function wsHandler (conn) {
    conn.pipe(conn)
    t.teardown(() => conn.destroy())
    throw new Error('Fail')
  })

  await fastify.listen({ port: 0 })
  const ws = new WebSocket('ws://localhost:' + fastify.server.address().port)
  const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
  t.teardown(() => client.destroy())

  await p
})

test('Should run custom errorHandler on error inside async websocket handler', async (t) => {
  const fastify = Fastify()
  t.teardown(() => fastify.close())

  let _resolve
  const p = new Promise((resolve) => {
    _resolve = resolve
  })

  const options = {
    errorHandler: function (error) {
      t.equal(error.message, 'Fail')
      _resolve()
    }
  }

  await fastify.register(fastifyWebsocket, options)

  fastify.get('/', { websocket: true }, async function wsHandler (conn) {
    conn.pipe(conn)
    t.teardown(() => conn.destroy())
    throw new Error('Fail')
  })

  await fastify.listen({ port: 0 })
  const ws = new WebSocket('ws://localhost:' + fastify.server.address().port)
  const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
  t.teardown(() => client.destroy())
  await p
})

test('Should be able to pass custom options to websocket-stream', async (t) => {
  t.plan(2)

  const fastify = Fastify()
  t.teardown(() => fastify.close())

  const options = {
    verifyClient: function (info) {
      t.equal(info.req.headers['x-custom-header'], 'fastify is awesome !')

      return true
    }
  }

  await fastify.register(fastifyWebsocket, { options })

  fastify.get('/*', { websocket: true }, (connection) => {
    connection.pipe(connection)
    t.teardown(() => connection.destroy())
  })

  await fastify.listen({ port: 0 })

  const clientOptions = { headers: { 'x-custom-header': 'fastify is awesome !' } }
  const ws = new WebSocket('ws://localhost:' + fastify.server.address().port, clientOptions)
  const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
  t.teardown(() => client.destroy())

  client.setEncoding('utf8')
  client.write('hello')

  const [chunk] = await once(client, 'data')
  t.equal(chunk, 'hello')
  client.end()
})

test('Should warn if path option is provided to websocket-stream', async (t) => {
  t.plan(3)
  const logStream = split(JSON.parse)
  const fastify = Fastify({
    logger: {
      stream: logStream,
      level: 'warn'
    }
  })

  logStream.once('data', line => {
    t.equal(line.msg, 'ws server path option shouldn\'t be provided, use a route instead')
    t.equal(line.level, 40)
  })

  t.teardown(() => fastify.close())

  const options = { path: '/' }
  await fastify.register(fastifyWebsocket, { options })

  fastify.get('/*', { websocket: true }, (connection) => {
    connection.pipe(connection)
    t.teardown(() => connection.destroy())
  })

  await fastify.listen({ port: 0 })

  const clientOptions = { headers: { 'x-custom-header': 'fastify is awesome !' } }
  const ws = new WebSocket('ws://localhost:' + fastify.server.address().port, clientOptions)
  const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
  t.teardown(() => client.destroy())

  client.setEncoding('utf8')
  client.write('hello')

  const [chunk] = await once(client, 'data')
  t.equal(chunk, 'hello')
  client.end()
})

test('Should be able to pass a custom server option to websocket-stream', async (t) => {
  // We create an external server
  const externalServerPort = 3000
  const externalServer = http
    .createServer()
    .on('connection', (socket) => {
      socket.unref()
    })
    .listen(externalServerPort, 'localhost')

  const fastify = Fastify()
  t.teardown(() => {
    externalServer.close()
    fastify.close()
  })

  const options = {
    server: externalServer
  }

  await fastify.register(fastifyWebsocket, { options })

  fastify.get('/', { websocket: true }, (connection) => {
    connection.pipe(connection)
    t.teardown(() => connection.destroy())
  })

  await fastify.ready()

  const ws = new WebSocket('ws://localhost:' + externalServerPort)
  const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
  t.teardown(() => client.destroy())

  client.setEncoding('utf8')
  client.write('hello')

  const [chunk] = await once(client, 'data')
  t.equal(chunk, 'hello')
  client.end()
})

test('Should be able to pass clientTracking option in false to websocket-stream', (t) => {
  t.plan(2)

  const fastify = Fastify()

  const options = {
    clientTracking: false
  }

  fastify.register(fastifyWebsocket, { options })

  fastify.get('/*', { websocket: true }, (connection) => {
    connection.destroy()
  })

  fastify.listen({ port: 0 }, (err) => {
    t.error(err)

    fastify.close(err => {
      t.error(err)
    })
  })
})

test('Should be able to pass custom connectionOptions to createWebSocketStream', async (t) => {
  t.plan(2)

  const fastify = Fastify()
  t.teardown(() => fastify.close())

  const connectionOptions = {
    readableObjectMode: true
  }

  await fastify.register(fastifyWebsocket, { connectionOptions })

  let _resolve
  const p = new Promise((resolve) => {
    _resolve = resolve
  })

  fastify.get('/', { websocket: true }, (connection) => {
    t.equal(connection.readableObjectMode, true)
    connection.socket.binaryType = 'arraybuffer'

    connection.once('data', (chunk) => {
      const message = new util.TextDecoder().decode(chunk)
      t.equal(message, 'Hello')
      _resolve()
    })
    t.teardown(() => connection.destroy())
  })

  await fastify.listen({ port: 0 })

  const ws = new WebSocket('ws://localhost:' + fastify.server.address().port)
  const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
  t.teardown(() => client.destroy())

  client.setEncoding('utf8')
  client.write('Hello')
  await p
})

test('Should be able to pass preClose option to override default', async (t) => {
  t.plan(3)

  const fastify = Fastify()

  const preClose = (done) => {
    t.pass('Custom preclose successfully called')

    for (const connection of fastify.websocketServer.clients) {
      connection.close()
    }
    done()
  }

  await fastify.register(fastifyWebsocket, { preClose })

  fastify.get('/', { websocket: true }, (connection) => {
    connection.setEncoding('utf8')
    t.teardown(() => connection.destroy())

    connection.once('data', (chunk) => {
      t.equal(chunk, 'hello server')
      connection.write('hello client')
      connection.end()
    })
  })

  await fastify.listen({ port: 0 })

  const ws = new WebSocket('ws://localhost:' + fastify.server.address().port)
  const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
  t.teardown(() => client.destroy())

  client.setEncoding('utf8')
  client.write('hello server')

  const [chunk] = await once(client, 'data')
  t.equal(chunk, 'hello client')
  client.end()

  await fastify.close()
})

test('Should fail if custom preClose is not a function', async (t) => {
  t.plan(2)

  const fastify = Fastify()
  t.teardown(() => fastify.close())

  const preClose = 'Not a function'

  try {
    await fastify.register(fastifyWebsocket, { preClose })
  } catch (err) {
    t.equal(err.message, 'invalid preClose function')
  }

  fastify.get('/', { websocket: true }, (connection) => {
    t.teardown(() => connection.destroy())
  })

  try {
    await fastify.listen({ port: 0 })
  } catch (err) {
    t.equal(err.message, 'invalid preClose function')
  }
})

test('Should gracefully close with a connected client', async (t) => {
  t.plan(2)

  const fastify = Fastify()

  await fastify.register(fastifyWebsocket)
  let serverConnEnded

  fastify.get('/', { websocket: true }, (connection) => {
    connection.setEncoding('utf8')
    connection.write('hello client')

    connection.once('data', (chunk) => {
      t.equal(chunk, 'hello server')
    })

    serverConnEnded = once(connection, 'end')
    // this connection stays alive untile we close the server
  })

  await fastify.listen({ port: 0 })

  const ws = new WebSocket('ws://localhost:' + fastify.server.address().port)
  const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })

  client.setEncoding('utf8')
  client.write('hello server')

  const ended = once(client, 'end')

  const [chunk] = await once(client, 'data')
  t.equal(chunk, 'hello client')
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
      t.equal(err.message, 'Unexpected server response: 503')
      oldClose.call(this, cb)
    })
  }

  await fastify.register(fastifyWebsocket)

  fastify.get('/', { websocket: true }, (connection) => {
    t.pass('received client connection')
    connection.destroy()
    // this connection stays alive until we close the server
  })

  await fastify.listen({ port: 0 })

  const ws = new WebSocket('ws://localhost:' + fastify.server.address().port)

  ws.on('close', () => {
    t.pass('client 1 closed')
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

  fastify.get('/', { websocket: true }, ({ socket }) => {
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
      t.ok(unhandled <= threshold)
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

  fastify.get('/', { websocket: true }, ({ socket }) => {
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
  t.equal(handled, total)
})

test('Should error server if the noServer option is set', (t) => {
  t.plan(1)
  const fastify = Fastify()

  fastify.register(fastifyWebsocket, { options: { noServer: true } })
  t.rejects(fastify.ready())
})

test('Should preserve the prefix in non-websocket routes', (t) => {
  t.plan(3)

  const fastify = Fastify()
  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(async function (fastify) {
    t.equal(fastify.prefix, '/hello')
    fastify.get('/', function (_, reply) {
      t.equal(this.prefix, '/hello')
      reply.send('hello')
    })
  }, { prefix: '/hello' })

  fastify.inject('/hello', function (err) {
    t.error(err)
  })
})

test('Should Handle WebSocket errors to avoid Node.js crashes', async t => {
  t.plan(1)

  const fastify = Fastify()
  await fastify.register(fastifyWebsocket)

  fastify.get('/', { websocket: true }, ({ socket }) => {
    socket.on('error', err => {
      t.equal(err.code, 'WS_ERR_UNEXPECTED_RSV_2_3')
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

  t.equal(fastify.server.listeners('upgrade').length, 0)
})

test('clashing upgrade handler', async (t) => {
  const fastify = Fastify()
  t.teardown(() => fastify.close())

  fastify.server.on('upgrade', (req, socket, head) => {
    const res = new http.ServerResponse(req)
    res.assignSocket(socket)
    res.end()
    socket.destroy()
  })

  await fastify.register(fastifyWebsocket)

  fastify.get('/', { websocket: true }, (connection) => {
    t.fail('this should never be invoked')
  })

  await fastify.listen({ port: 0 })

  const ws = new WebSocket('ws://localhost:' + fastify.server.address().port)
  await once(ws, 'error')
})
