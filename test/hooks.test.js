'use strict'

const { test } = require('node:test')
const net = require('node:net')
const Fastify = require('fastify')
const fastifyWebsocket = require('..')
const WebSocket = require('ws')
const split = require('split2')

test('Should run onRequest, preValidation, preHandler hooks', (t, end) => {
  t.plan(8)
  const fastify = Fastify()

  t.after(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(async function (fastify) {
    fastify.addHook('onRequest', async ({ routeOptions: { schema: { hide } } }) => {
      t.assert.ok('called', 'onRequest')
      t.assert.strictEqual(hide, true, 'schema hide property should be set to true when route option is websocket')
    })
    fastify.addHook('preParsing', async () => t.assert.ok('called', 'preParsing'))
    fastify.addHook('preValidation', async () => t.assert.ok('called', 'preValidation'))
    fastify.addHook('preHandler', async () => t.assert.ok('called', 'preHandler'))

    fastify.get('/echo', { websocket: true }, (socket) => {
      socket.send('hello client')
      t.after(() => socket.terminate())

      socket.once('message', (chunk) => {
        t.assert.deepStrictEqual(chunk.toString(), 'hello server')
        end()
      })
    })
  })

  fastify.listen({ port: 0 }, err => {
    t.assert.ifError(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/echo')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.after(() => client.destroy())

    client.setEncoding('utf8')
    client.write('hello server')

    client.once('data', chunk => {
      t.assert.deepStrictEqual(chunk, 'hello client')
      client.end()
    })
  })
})

test('Should not run onTimeout hook', (t, end) => {
  t.plan(2)
  const fastify = Fastify()

  t.after(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(async function () {
    fastify.addHook('onTimeout', async () => t.assert.fail('called', 'onTimeout'))

    fastify.get('/echo', { websocket: true }, (socket, request) => {
      socket.send('hello client')
      request.raw.setTimeout(50)
      t.after(() => socket.terminate())
    })
  })

  fastify.listen({ port: 0 }, err => {
    t.assert.ifError(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/echo')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.after(() => client.destroy())

    client.once('data', chunk => {
      t.assert.deepStrictEqual(chunk, 'hello client')
      end()
    })
  })
})

test('Should run onError hook before handler is executed (error thrown in onRequest hook)', (t, end) => {
  t.plan(3)
  const fastify = Fastify()

  t.after(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(async function (fastify) {
    fastify.addHook('onRequest', async () => { throw new Error('Fail') })
    fastify.addHook('onError', async () => t.assert.ok('called', 'onError'))

    fastify.get('/echo', { websocket: true }, () => {
      t.assert.fail()
    })
  })

  fastify.listen({ port: 0 }, function (err) {
    t.assert.ifError(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/echo')
    ws.on('unexpected-response', (_request, response) => {
      t.assert.deepStrictEqual(response.statusCode, 500)
      end()
    })
  })
})

test('Should run onError hook before handler is executed (error thrown in preValidation hook)', (t, end) => {
  t.plan(3)
  const fastify = Fastify()

  t.after(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(async function (fastify) {
    fastify.addHook('preValidation', async () => {
      await Promise.resolve()
      throw new Error('Fail')
    })

    fastify.addHook('onError', async () => t.assert.ok('called', 'onError'))

    fastify.get('/echo', { websocket: true }, () => {
      t.assert.fail()
    })
  })

  fastify.listen({ port: 0 }, function (err) {
    t.assert.ifError(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/echo')
    ws.on('unexpected-response', (_request, response) => {
      t.assert.deepStrictEqual(response.statusCode, 500)
      end()
    })
  })
})

test('onError hooks can send a reply and prevent hijacking', (t, end) => {
  t.plan(3)
  const fastify = Fastify()

  t.after(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(async function (fastify) {
    fastify.addHook('preValidation', async () => {
      await Promise.resolve()
      throw new Error('Fail')
    })

    fastify.addHook('onError', async (_request, reply) => {
      t.assert.ok('called', 'onError')
      await reply.code(501).send('there was an error')
    })

    fastify.get('/echo', { websocket: true }, () => {
      t.assert.fail()
    })
  })

  fastify.listen({ port: 0 }, function (err) {
    t.assert.ifError(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/echo')
    ws.on('unexpected-response', (_request, response) => {
      t.assert.deepStrictEqual(response.statusCode, 501)
      end()
    })
  })
})

test('setErrorHandler functions can send a reply and prevent hijacking', (t, end) => {
  t.plan(4)
  const fastify = Fastify()

  t.after(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(async function (fastify) {
    fastify.addHook('preValidation', async () => {
      await Promise.resolve()
      throw new Error('Fail')
    })

    fastify.setErrorHandler(async (error, _request, reply) => {
      t.assert.ok('called', 'onError')
      t.assert.ok(error)
      await reply.code(501).send('there was an error')
    })

    fastify.get('/echo', { websocket: true }, () => {
      t.assert.fail()
    })
  })

  fastify.listen({ port: 0 }, function (err) {
    t.assert.ifError(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/echo')
    ws.on('unexpected-response', (_request, response) => {
      t.assert.deepStrictEqual(response.statusCode, 501)
      end()
    })
  })
})

test('Should not run onError hook if reply was already hijacked (error thrown in websocket handler)', (t, end) => {
  t.plan(2)
  const fastify = Fastify()

  t.after(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(async function (fastify) {
    fastify.addHook('onError', async () => t.assert.fail('called', 'onError'))

    fastify.get('/echo', { websocket: true }, async (socket) => {
      t.after(() => socket.terminate())
      throw new Error('Fail')
    })
  })

  fastify.listen({ port: 0 }, function (err) {
    t.assert.ifError(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/echo')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.after(() => client.destroy())
    ws.on('close', code => {
      t.assert.deepStrictEqual(code, 1006)
      end()
    })
  })
})

test('Should not run preSerialization/onSend hooks', (t, end) => {
  t.plan(2)
  const fastify = Fastify()

  t.after(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(async function (fastify) {
    fastify.addHook('onSend', async () => t.assert.fail('called', 'onSend'))
    fastify.addHook('preSerialization', async () => t.assert.fail('called', 'preSerialization'))

    fastify.get('/echo', { websocket: true }, async (socket) => {
      socket.send('hello client')
      t.after(() => socket.terminate())
    })
  })

  fastify.listen({ port: 0 }, err => {
    t.assert.ifError(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/echo')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.after(() => client.destroy())

    client.once('data', chunk => {
      t.assert.deepStrictEqual(chunk, 'hello client')
      client.end()
      end()
    })
  })
})

test('Should not hijack reply for a normal http request in the internal onError hook', (t, end) => {
  t.plan(2)
  const fastify = Fastify()

  t.after(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(async function (fastify) {
    fastify.get('/', async () => {
      throw new Error('Fail')
    })
  })

  fastify.listen({ port: 0 }, err => {
    t.assert.ifError(err)

    const port = fastify.server.address().port

    const httpClient = net.createConnection({ port }, () => {
      t.after(() => httpClient.destroy())

      httpClient.write('GET / HTTP/1.1\r\nHOST: localhost\r\n\r\n')
      httpClient.once('data', data => {
        t.assert.match(data.toString(), /Fail/i)
        end()
      })
      httpClient.end()
    })
  })
})

test('Should run async hooks and still deliver quickly sent messages', (t, end) => {
  t.plan(3)
  const fastify = Fastify()

  t.after(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(async function (fastify) {
    fastify.addHook(
      'preValidation',
      async () => await new Promise((resolve) => setTimeout(resolve, 25))
    )

    fastify.get('/echo', { websocket: true }, (socket) => {
      socket.send('hello client')
      t.after(() => socket.terminate())

      socket.on('message', (message) => {
        t.assert.deepStrictEqual(message.toString('utf-8'), 'hello server')
        end()
      })
    })
  })

  fastify.listen({ port: 0 }, (err) => {
    t.assert.ifError(err)
    const ws = new WebSocket(
      'ws://localhost:' + fastify.server.address().port + '/echo'
    )
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.after(() => client.destroy())

    client.setEncoding('utf8')
    client.write('hello server')

    client.once('data', (chunk) => {
      t.assert.deepStrictEqual(chunk, 'hello client')
      client.end()
    })
  })
})

test('Should not hijack reply for an normal request to a websocket route that is sent a normal HTTP response in a hook', (t, end) => {
  t.plan(2)
  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.register(async function (fastify) {
    fastify.addHook('preValidation', async (_request, reply) => {
      await Promise.resolve()
      await reply.code(404).send('not found')
    })
    fastify.get('/echo', { websocket: true }, () => {
      t.assert.fail()
    })
  })

  fastify.listen({ port: 0 }, err => {
    t.assert.ifError(err)

    const port = fastify.server.address().port

    const httpClient = net.createConnection({ port }, () => {
      t.after(() => httpClient.destroy())
      httpClient.write('GET /echo HTTP/1.1\r\nHOST: localhost\r\n\r\n')
      httpClient.once('data', data => {
        t.assert.match(data.toString(), /not found/i)
        end()
      })
      httpClient.end()
    })
  })
})

test('Should not hijack reply for an WS request to a WS route that gets sent a normal HTTP response in a hook', (t, end) => {
  t.plan(2)
  const stream = split(JSON.parse)
  const fastify = Fastify({ logger: { stream } })

  fastify.register(fastifyWebsocket)
  fastify.register(async function (fastify) {
    fastify.addHook('preValidation', async (_request, reply) => {
      await reply.code(404).send('not found')
    })
    fastify.get('/echo', { websocket: true }, () => {
      t.assert.fail()
    })
  })

  stream.on('data', (chunk) => {
    if (chunk.level >= 50) {
      t.assert.fail()
    }
  })

  fastify.listen({ port: 0 }, err => {
    t.assert.ifError(err)

    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/echo')

    ws.on('error', error => {
      t.assert.ok(error)
      ws.close()
      fastify.close()
      end()
    })
  })
})
