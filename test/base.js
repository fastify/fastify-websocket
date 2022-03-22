'use strict'

const http = require('http')
const util = require('util')
const split = require('split2')
const test = require('tap').test
const Fastify = require('fastify')
const fastifyWebsocket = require('..')
const WebSocket = require('ws')

test('Should expose a websocket', (t) => {
  t.plan(3)

  const fastify = Fastify()
  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.get('/', { websocket: true }, (connection, request) => {
    connection.setEncoding('utf8')
    connection.write('hello client')
    t.teardown(() => connection.destroy())

    connection.once('data', (chunk) => {
      t.equal(chunk, 'hello server')
      connection.end()
    })
  })

  fastify.listen(0, (err) => {
    t.error(err)

    const ws = new WebSocket('ws://localhost:' + fastify.server.address().port)
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.teardown(() => client.destroy())

    client.setEncoding('utf8')
    client.write('hello server')

    client.once('data', (chunk) => {
      t.equal(chunk, 'hello client')
      client.end()
    })
  })
})

test('Should fail if custom errorHandler is not a function', (t) => {
  t.plan(2)

  const fastify = Fastify()
  t.teardown(() => fastify.close())

  fastify
    .register(fastifyWebsocket, { errorHandler: {} })
    .after(err => t.equal(err.message, 'invalid errorHandler function'))

  fastify.get('/', { websocket: true }, (connection, request) => {
    t.teardown(() => connection.destroy())
  })

  fastify.listen(0, (err) => {
    t.error(err)
  })
})

test('Should run custom errorHandler on wildcard route handler error', (t) => {
  t.plan(2)

  const fastify = Fastify()
  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket, {
    errorHandler: function (error, connection) {
      t.equal(error.message, 'Fail')
    }
  })

  fastify.get('/*', { websocket: true }, (conn, request) => {
    conn.pipe(conn)
    t.teardown(() => conn.destroy())
    return Promise.reject(new Error('Fail'))
  })

  fastify.listen(0, (err) => {
    t.error(err)

    const ws = new WebSocket('ws://localhost:' + fastify.server.address().port)
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.teardown(() => client.destroy())
  })
})

test('Should run custom errorHandler on error inside websocket handler', (t) => {
  t.plan(2)

  const fastify = Fastify()
  t.teardown(() => fastify.close())

  const options = {
    errorHandler: function (error, connection) {
      t.equal(error.message, 'Fail')
    }
  }

  fastify.register(fastifyWebsocket, options)

  fastify.get('/', { websocket: true }, function wsHandler (conn, request) {
    conn.pipe(conn)
    t.teardown(() => conn.destroy())
    throw new Error('Fail')
  })

  fastify.listen(0, (err) => {
    t.error(err)

    const ws = new WebSocket('ws://localhost:' + fastify.server.address().port)
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.teardown(() => client.destroy())
  })
})

test('Should run custom errorHandler on error inside async websocket handler', (t) => {
  t.plan(2)

  const fastify = Fastify()
  t.teardown(() => fastify.close())

  const options = {
    errorHandler: function (error, connection) {
      t.equal(error.message, 'Fail')
    }
  }

  fastify.register(fastifyWebsocket, options)

  fastify.get('/', { websocket: true }, async function wsHandler (conn, request) {
    conn.pipe(conn)
    t.teardown(() => conn.destroy())
    throw new Error('Fail')
  })

  fastify.listen(0, (err) => {
    t.error(err)

    const ws = new WebSocket('ws://localhost:' + fastify.server.address().port)
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.teardown(() => client.destroy())
  })
})

test('Should be able to pass custom options to websocket-stream', (t) => {
  t.plan(3)

  const fastify = Fastify()
  t.teardown(() => fastify.close())

  const options = {
    verifyClient: function (info) {
      t.equal(info.req.headers['x-custom-header'], 'fastify is awesome !')

      return true
    }
  }

  fastify.register(fastifyWebsocket, { options })

  fastify.get('/*', { websocket: true }, (connection, request) => {
    connection.pipe(connection)
    t.teardown(() => connection.destroy())
  })

  fastify.listen(0, (err) => {
    t.error(err)

    const clientOptions = { headers: { 'x-custom-header': 'fastify is awesome !' } }
    const ws = new WebSocket('ws://localhost:' + fastify.server.address().port, clientOptions)
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.teardown(() => client.destroy())

    client.setEncoding('utf8')
    client.write('hello')

    client.once('data', (chunk) => {
      t.equal(chunk, 'hello')
      client.end()
    })
  })
})

test('Should warn if path option is provided to websocket-stream', (t) => {
  t.plan(4)
  const logStream = split(JSON.parse)
  let fastify
  try {
    fastify = Fastify({
      logger: {
        stream: logStream,
        level: 'warn'
      }
    })
  } catch (e) {
    t.fail()
  }

  logStream.once('data', line => {
    t.equal(line.msg, 'ws server path option shouldn\'t be provided, use a route instead')
    t.equal(line.level, 40)
  })

  t.teardown(() => fastify.close())

  const options = { path: '/' }
  fastify.register(fastifyWebsocket, { options })

  fastify.get('/*', { websocket: true }, (connection, request) => {
    connection.pipe(connection)
    t.teardown(() => connection.destroy())
  })

  fastify.listen(0, (err) => {
    t.error(err)

    const clientOptions = { headers: { 'x-custom-header': 'fastify is awesome !' } }
    const ws = new WebSocket('ws://localhost:' + fastify.server.address().port, clientOptions)
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.teardown(() => client.destroy())

    client.setEncoding('utf8')
    client.write('hello')

    client.once('data', (chunk) => {
      t.equal(chunk, 'hello')
      client.end()
    })
  })
})

test('Should be able to pass a custom server option to websocket-stream', (t) => {
  t.plan(2)

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

  fastify.register(fastifyWebsocket, { options })

  fastify.get('/', { websocket: true }, (connection, request) => {
    connection.pipe(connection)
    t.teardown(() => connection.destroy())
  })

  fastify.listen(0, (err) => {
    t.error(err)

    const ws = new WebSocket('ws://localhost:' + externalServerPort)
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.teardown(() => client.destroy())

    client.setEncoding('utf8')
    client.write('hello')

    client.once('data', (chunk) => {
      t.equal(chunk, 'hello')
      client.end()
    })
  })
})

test('Should be able to pass clientTracking option in false to websocket-stream', (t) => {
  t.plan(2)

  const fastify = Fastify()

  const options = {
    clientTracking: false
  }

  fastify.register(fastifyWebsocket, { options })

  fastify.get('/*', { websocket: true }, (connection, request) => {
    connection.destroy()
  })

  fastify.listen(0, (err) => {
    t.error(err)

    fastify.close(err => {
      t.error(err)
    })
  })
})

test('Should be able to pass custom connectionOptions to createWebSocketStream', (t) => {
  t.plan(3)

  const fastify = Fastify()
  t.teardown(() => fastify.close())

  const connectionOptions = {
    readableObjectMode: true
  }

  fastify.register(fastifyWebsocket, { connectionOptions })

  fastify.get('/', { websocket: true }, (connection, request) => {
    // readableObjectMode was added in Node v12.3.0 so for earlier versions
    // we check the encapsulated readable state directly
    const mode = (typeof connection.readableObjectMode === 'undefined')
      ? connection._readableState.objectMode
      : connection.readableObjectMode
    t.equal(mode, true)
    connection.socket.binaryType = 'arraybuffer'

    connection.once('data', (chunk) => {
      const message = new util.TextDecoder().decode(chunk)
      t.equal(message, 'Hello')
    })
    t.teardown(() => connection.destroy())
  })

  fastify.listen(0, (err) => {
    t.error(err)

    const ws = new WebSocket('ws://localhost:' + fastify.server.address().port)
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.teardown(() => client.destroy())

    client.setEncoding('utf8')
    client.write('Hello')
  })
})

test('Should gracefully close with a connected client', (t) => {
  t.plan(6)

  const fastify = Fastify()

  fastify.register(fastifyWebsocket)

  fastify.get('/', { websocket: true }, (connection, request) => {
    connection.setEncoding('utf8')
    connection.write('hello client')

    connection.once('data', (chunk) => {
      t.equal(chunk, 'hello server')
    })

    connection.on('end', () => {
      t.pass('end emitted on server side')
    })
    // this connection stays alive untile we close the server
  })

  fastify.listen(0, (err) => {
    t.error(err)

    const ws = new WebSocket('ws://localhost:' + fastify.server.address().port)
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })

    client.setEncoding('utf8')
    client.write('hello server')

    client.on('end', () => {
      t.pass('end emitted on client side')
    })

    client.once('data', (chunk) => {
      t.equal(chunk, 'hello client')
      fastify.close(function (err) {
        t.error(err)
      })
    })
  })
})

test('Should gracefully close when clients attempt to connect after calling close', (t) => {
  t.plan(5)

  const fastify = Fastify()

  const oldClose = fastify.server.close
  fastify.server.close = function (cb) {
    const ws = new WebSocket('ws://localhost:' + fastify.server.address().port)

    ws.on('close', () => {
      t.pass('client 2 closed')
    })

    ws.on('open', () => {
      oldClose.call(this, cb)
    })
  }

  fastify.register(fastifyWebsocket)

  fastify.get('/', { websocket: true }, (connection, request) => {
    t.pass('received client connection')
    t.teardown(() => connection.destroy())
    // this connection stays alive until we close the server
  })

  fastify.listen(0, (err) => {
    t.error(err)

    const ws = new WebSocket('ws://localhost:' + fastify.server.address().port)

    ws.on('close', () => {
      t.pass('client 1 closed')
    })

    ws.on('open', (chunk) => {
      fastify.close(function (err) {
        t.error(err)
      })
    })
  })
})

/*
  This test sends one message every 10 ms.
  After 50 messages have been sent, we check how many unhandled messages the server has.
  After 100 messages we check this number has not increased but rather decreased
  the number of unhandled messages below a threshold, which means it is still able
  to process message.
*/
test('Should keep accepting connection', t => {
  t.plan(3)

  const fastify = Fastify()
  let sent = 0
  let unhandled = 0
  let threshold = 0

  fastify.register(fastifyWebsocket)

  fastify.get('/', { websocket: true }, ({ socket }, request, reply) => {
    socket.on('message', message => {
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

  fastify.listen(0, err => {
    t.error(err)

    // Setup a client that sends a lot of messages to the server
    const client = new WebSocket('ws://localhost:' + fastify.server.address().port)

    client.on('open', event => {
      const message = Buffer.alloc(1024, Date.now())

      const interval = setInterval(() => {
        client.send(message.toString(), 10)
        sent++
        unhandled++

        if (sent === 50) {
          threshold = unhandled
        } else if (sent === 100) {
          clearInterval(interval)

          fastify.close(err => {
            t.error(err)
            t.ok(unhandled <= threshold)
          })
        }
      }, 10)
    })

    client.on('error', console.error)
  })
})

test('Should keep processing message when many medium sized messages are sent', t => {
  t.plan(3)

  const fastify = Fastify()
  const total = 200
  let safetyInterval
  let sent = 0
  let handled = 0

  fastify.register(fastifyWebsocket)

  fastify.get('/', { websocket: true }, ({ socket }, req) => {
    socket.on('message', message => {
      socket.send('handled')
    })

    socket.on('error', err => {
      t.error(err)
    })

    /*
      This is a safety check - If the socket is stuck, fastify.close will not run.
    */
    safetyInterval = setInterval(() => {
      if (sent < total) {
        return
      }

      t.fail('Forcibly closed.')

      clearInterval(safetyInterval)
      socket.terminate()
    }, 100)
  })

  fastify.listen(0, err => {
    t.error(err)

    // Setup a client that sends a lot of messages to the server
    const client = new WebSocket('ws://localhost:' + fastify.server.address().port)

    client.on('open', () => {
      for (let i = 0; i < total; i++) {
        client.send(Buffer.alloc(160, `${i}`).toString('utf-8'))
        sent++
      }
    })

    client.on('message', message => {
      handled++

      if (handled === total) {
        fastify.close(err => {
          clearInterval(safetyInterval)
          t.error(err)
          t.equal(handled, total)
        })
      }
    })

    client.on('error', console.error)
  })
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
    fastify.get('/', function (request, reply) {
      t.equal(this.prefix, '/hello')
      reply.send('hello')
    })
  }, { prefix: '/hello' })

  fastify.inject('/hello', function (err) {
    t.error(err)
  })
})
