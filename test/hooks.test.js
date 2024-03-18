'use strict'

const test = require('tap').test
const net = require('node:net')
const Fastify = require('fastify')
const fastifyWebsocket = require('..')
const WebSocket = require('ws')
const split = require('split2')

test('Should run onRequest, preValidation, preHandler hooks', t => {
  t.plan(7)
  const fastify = Fastify()

  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(async function (fastify) {
    fastify.addHook('onRequest', async (request, reply) => t.ok('called', 'onRequest'))
    fastify.addHook('preParsing', async (request, reply, payload) => t.ok('called', 'preParsing'))
    fastify.addHook('preValidation', async (request, reply) => t.ok('called', 'preValidation'))
    fastify.addHook('preHandler', async (request, reply) => t.ok('called', 'preHandler'))

    fastify.get('/echo', { websocket: true }, (socket, request) => {
      socket.send('hello client')
      t.teardown(() => socket.terminate())

      socket.once('message', (chunk) => {
        t.equal(chunk.toString(), 'hello server')
      })
    })
  })

  fastify.listen({ port: 0 }, err => {
    t.error(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/echo')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.teardown(client.destroy.bind(client))

    client.setEncoding('utf8')
    client.write('hello server')

    client.once('data', chunk => {
      t.equal(chunk, 'hello client')
      client.end()
    })
  })
})

test('Should not run onTimeout hook', t => {
  t.plan(2)
  const fastify = Fastify()

  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(async function () {
    fastify.addHook('onTimeout', async (request, reply) => t.fail('called', 'onTimeout'))

    fastify.get('/echo', { websocket: true }, (socket, request) => {
      socket.send('hello client')
      request.raw.setTimeout(50)
      t.teardown(() => socket.terminate())
    })
  })

  fastify.listen({ port: 0 }, err => {
    t.error(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/echo')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.teardown(client.destroy.bind(client))

    client.once('data', chunk => {
      t.equal(chunk, 'hello client')
    })
  })
})

test('Should run onError hook before handler is executed (error thrown in onRequest hook)', t => {
  t.plan(3)
  const fastify = Fastify()

  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(async function (fastify) {
    fastify.addHook('onRequest', async (request, reply) => { throw new Error('Fail') })
    fastify.addHook('onError', async (request, reply) => t.ok('called', 'onError'))

    fastify.get('/echo', { websocket: true }, (conn, request) => {
      t.fail()
    })
  })

  fastify.listen({ port: 0 }, function (err) {
    t.error(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/echo')
    ws.on('unexpected-response', (_request, response) => t.equal(response.statusCode, 500))
  })
})

test('Should run onError hook before handler is executed (error thrown in preValidation hook)', t => {
  t.plan(3)
  const fastify = Fastify()

  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(async function (fastify) {
    fastify.addHook('preValidation', async (request, reply) => {
      await Promise.resolve()
      throw new Error('Fail')
    })

    fastify.addHook('onError', async (request, reply) => t.ok('called', 'onError'))

    fastify.get('/echo', { websocket: true }, (conn, request) => {
      t.fail()
    })
  })

  fastify.listen({ port: 0 }, function (err) {
    t.error(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/echo')
    ws.on('unexpected-response', (_request, response) => t.equal(response.statusCode, 500))
  })
})

test('onError hooks can send a reply and prevent hijacking', t => {
  t.plan(3)
  const fastify = Fastify()

  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(async function (fastify) {
    fastify.addHook('preValidation', async (request, reply) => {
      await Promise.resolve()
      throw new Error('Fail')
    })

    fastify.addHook('onError', async (request, reply) => {
      t.ok('called', 'onError')
      await reply.code(501).send('there was an error')
    })

    fastify.get('/echo', { websocket: true }, (conn, request) => {
      t.fail()
    })
  })

  fastify.listen({ port: 0 }, function (err) {
    t.error(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/echo')
    ws.on('unexpected-response', (_request, response) => t.equal(response.statusCode, 501))
  })
})

test('setErrorHandler functions can send a reply and prevent hijacking', t => {
  t.plan(4)
  const fastify = Fastify()

  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(async function (fastify) {
    fastify.addHook('preValidation', async (request, reply) => {
      await Promise.resolve()
      throw new Error('Fail')
    })

    fastify.setErrorHandler(async (error, request, reply) => {
      t.ok('called', 'onError')
      t.ok(error)
      await reply.code(501).send('there was an error')
    })

    fastify.get('/echo', { websocket: true }, (conn, request) => {
      t.fail()
    })
  })

  fastify.listen({ port: 0 }, function (err) {
    t.error(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/echo')
    ws.on('unexpected-response', (_request, response) => t.equal(response.statusCode, 501))
  })
})

test('Should not run onError hook if reply was already hijacked (error thrown in websocket handler)', t => {
  t.plan(2)
  const fastify = Fastify()

  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(async function (fastify) {
    fastify.addHook('onError', async (request, reply) => t.fail('called', 'onError'))

    fastify.get('/echo', { websocket: true }, async (socket, request) => {
      t.teardown(() => socket.terminate())
      throw new Error('Fail')
    })
  })

  fastify.listen({ port: 0 }, function (err) {
    t.error(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/echo')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.teardown(client.destroy.bind(client))
    ws.on('close', code => t.equal(code, 1006))
  })
})

test('Should not run preSerialization/onSend hooks', t => {
  t.plan(2)
  const fastify = Fastify()

  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(async function (fastify) {
    fastify.addHook('onSend', async (request, reply) => t.fail('called', 'onSend'))
    fastify.addHook('preSerialization', async (request, reply) => t.fail('called', 'preSerialization'))

    fastify.get('/echo', { websocket: true }, async (socket, request) => {
      socket.send('hello client')
      t.teardown(() => socket.terminate())
    })
  })

  fastify.listen({ port: 0 }, err => {
    t.error(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/echo')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.teardown(client.destroy.bind(client))

    client.once('data', chunk => {
      t.equal(chunk, 'hello client')
      client.end()
    })
  })
})

test('Should not hijack reply for a normal http request in the internal onError hook', t => {
  t.plan(2)
  const fastify = Fastify()

  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(async function (fastify) {
    fastify.get('/', async (request, reply) => {
      throw new Error('Fail')
    })
  })

  fastify.listen({ port: 0 }, err => {
    t.error(err)

    const port = fastify.server.address().port

    const httpClient = net.createConnection({ port }, () => {
      t.teardown(httpClient.destroy.bind(httpClient))

      httpClient.write('GET / HTTP/1.1\r\nHOST: localhost\r\n\r\n')
      httpClient.once('data', data => {
        t.match(data.toString(), /Fail/i)
      })
      httpClient.end()
    })
  })
})

test('Should run async hooks and still deliver quickly sent messages', (t) => {
  t.plan(3)
  const fastify = Fastify()

  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(async function (fastify) {
    fastify.addHook(
      'preValidation',
      async () => await new Promise((resolve) => setTimeout(resolve, 25))
    )

    fastify.get('/echo', { websocket: true }, (socket, request) => {
      socket.send('hello client')
      t.teardown(() => socket.terminate())

      socket.on('message', (message) => {
        t.equal(message.toString('utf-8'), 'hello server')
      })
    })
  })

  fastify.listen({ port: 0 }, (err) => {
    t.error(err)
    const ws = new WebSocket(
      'ws://localhost:' + fastify.server.address().port + '/echo'
    )
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.teardown(client.destroy.bind(client))

    client.setEncoding('utf8')
    client.write('hello server')

    client.once('data', (chunk) => {
      t.equal(chunk, 'hello client')
      client.end()
    })
  })
})

test('Should not hijack reply for an normal request to a websocket route that is sent a normal HTTP response in a hook', t => {
  t.plan(2)
  const fastify = Fastify()
  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.register(async function (fastify) {
    fastify.addHook('preValidation', async (request, reply) => {
      await Promise.resolve()
      await reply.code(404).send('not found')
    })
    fastify.get('/echo', { websocket: true }, (conn, request) => {
      t.fail()
    })
  })

  fastify.listen({ port: 0 }, err => {
    t.error(err)

    const port = fastify.server.address().port

    const httpClient = net.createConnection({ port }, () => {
      t.teardown(httpClient.destroy.bind(httpClient))
      httpClient.write('GET /echo HTTP/1.1\r\nHOST: localhost\r\n\r\n')
      httpClient.once('data', data => {
        t.match(data.toString(), /not found/i)
      })
      httpClient.end()
    })
  })
})

test('Should not hijack reply for an WS request to a WS route that gets sent a normal HTTP response in a hook', t => {
  t.plan(2)
  const stream = split(JSON.parse)
  const fastify = Fastify({ logger: { stream } })

  fastify.register(fastifyWebsocket)
  fastify.register(async function (fastify) {
    fastify.addHook('preValidation', async (request, reply) => {
      await reply.code(404).send('not found')
    })
    fastify.get('/echo', { websocket: true }, (conn, request) => {
      t.fail()
    })
  })

  stream.on('data', (chunk) => {
    if (chunk.level >= 50) {
      t.fail()
    }
  })

  fastify.listen({ port: 0 }, err => {
    t.error(err)

    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/echo')

    ws.on('error', error => {
      t.ok(error)
      ws.close()
      fastify.close()
    })
  })
})
