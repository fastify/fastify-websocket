'use strict'

const http = require('http')
const test = require('tap').test
const Fastify = require('fastify')
const fastifyWebsocket = require('..')
const WebSocket = require('ws')

test('Should expose a websocket', (t) => {
  t.plan(3)

  const fastify = Fastify()
  t.tearDown(() => fastify.close())

  fastify.register(fastifyWebsocket, { handle })

  function handle (connection) {
    connection.setEncoding('utf8')
    connection.write('hello client')
    t.tearDown(() => connection.destroy())

    connection.once('data', (chunk) => {
      t.equal(chunk, 'hello server')
      connection.end()
    })
  }

  fastify.listen(0, (err) => {
    t.error(err)

    const ws = new WebSocket('ws://localhost:' + fastify.server.address().port)
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.tearDown(() => client.destroy())

    client.setEncoding('utf8')
    client.write('hello server')

    client.once('data', (chunk) => {
      t.equal(chunk, 'hello client')
      client.end()
    })
  })
})

test('Should be able to pass custom options to websocket-stream', (t) => {
  t.plan(3)

  const fastify = Fastify()
  t.tearDown(() => fastify.close())

  const options = {
    verifyClient: function (info) {
      t.equal(info.req.headers['x-custom-header'], 'fastify is awesome !')

      return true
    }
  }

  fastify.register(fastifyWebsocket, { handle, options })

  // this is all that's needed to create an echo server
  function handle (connection) {
    connection.pipe(connection)
    t.tearDown(() => connection.destroy())
  }

  fastify.listen(0, (err) => {
    t.error(err)

    const clientOptions = { headers: { 'x-custom-header': 'fastify is awesome !' } }
    const ws = new WebSocket('ws://localhost:' + fastify.server.address().port, clientOptions)
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.tearDown(() => client.destroy())

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
  t.tearDown(() => {
    externalServer.close()
    fastify.close()
  })

  const options = {
    server: externalServer
  }

  fastify.register(fastifyWebsocket, { handle, options })

  // this is all that's needed to create an echo server
  function handle (connection) {
    connection.pipe(connection)
    t.tearDown(() => connection.destroy())
  }

  fastify.listen(0, (err) => {
    t.error(err)

    const ws = new WebSocket('ws://localhost:' + externalServerPort)
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.tearDown(() => client.destroy())

    client.setEncoding('utf8')
    client.write('hello')

    client.once('data', (chunk) => {
      t.equal(chunk, 'hello')
      client.end()
    })
  })
})

test('Should throw on an invalid handle parameter', (t) => {
  t.plan(2)

  const fastify = Fastify()
  t.tearDown(() => fastify.close())

  const handle = 'handle must be a function'

  fastify.register(fastifyWebsocket, { handle })

  fastify.listen(0, (err) => {
    t.ok(err)
    t.equal(err.message, 'invalid handle function')
  })
})

test('Should gracefully close with a connected client', (t) => {
  t.plan(6)

  const fastify = Fastify()

  fastify.register(fastifyWebsocket, { handle })

  function handle (connection) {
    connection.setEncoding('utf8')
    connection.write('hello client')

    connection.once('data', (chunk) => {
      t.equal(chunk, 'hello server')
    })

    connection.on('end', () => {
      t.pass('end emitted on server side')
    })
    // this connection stays alive untile we close the server
  }

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

  fastify.register(fastifyWebsocket, { handle })

  function handle ({ socket }) {
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
  }

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
            t.true(unhandled < threshold)
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

test('Should not set server if noServer option is set', (t) => {
  t.plan(5)

  const fastify = Fastify()
  t.tearDown(() => {
    fastify.close()
  })

  const options = {
    noServer: true
  }

  fastify.register(fastifyWebsocket, { handle, options })

  // this is all that's needed to create an echo server
  function handle (connection) {
    connection.pipe(connection)
    t.tearDown(() => connection.destroy())
  }

  // As the websocketserver is now completely detached, we have to
  // handle the upgrade event.
  fastify.ready((err) => {
    t.error(err)

    t.assert(!fastify.websocketServer.server)

    fastify.server.on('upgrade', (request, socket, head) => {
      fastify.websocketServer.handleUpgrade(request, socket, head, (ws) => {
        fastify.websocketServer.emit('connection', ws, request)
      })
    })
  })

  fastify.listen(0, (err) => {
    t.error(err)

    const ws = new WebSocket('ws://localhost:' + fastify.server.address().port)
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.tearDown(() => client.destroy())

    client.setEncoding('utf8')
    client.write('hello')

    client.once('data', (chunk) => {
      t.equal(chunk, 'hello')
      fastify.close(function (err) {
        t.error(err)
      })
    })
  })
})
