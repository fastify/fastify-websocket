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
