'use strict'

const test = require('tap').test
const Fastify = require('fastify')
const fastifyWebsocket = require('..')
const WebSocket = require('ws')

test('Should run onRequest, preParsing, preValidation, preHandler hooks', t => {
  t.plan(7)
  const fastify = Fastify()

  t.tearDown(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.addHook('onRequest', async (request, reply) => t.ok('called', 'onRequest'))
  fastify.addHook('preParsing', async (request, reply, payload) => t.ok('called', 'preParsing'))
  fastify.addHook('preValidation', async (request, reply) => t.ok('called', 'preValidation'))
  fastify.addHook('preHandler', async (request, reply) => t.ok('called', 'preHandler'))

  fastify.get('/echo', { websocket: true }, (conn, request) => {
    conn.setEncoding('utf8')
    conn.write('hello client')
    t.tearDown(conn.destroy.bind(conn))

    conn.once('data', chunk => {
      t.equal(chunk, 'hello server')
      conn.end()
    })
  })

  fastify.listen(0, err => {
    t.error(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/echo')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.tearDown(client.destroy.bind(client))

    client.setEncoding('utf8')
    client.write('hello server')

    client.once('data', chunk => {
      t.equal(chunk, 'hello client')
      client.end()
    })
  })
})

test('Should run onTimeout hook', t => {
  t.plan(3)
  const fastify = Fastify()

  t.tearDown(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.addHook('onTimeout', async (request, reply) => t.ok('called', 'onTimeout'))

  fastify.get('/echo', { websocket: true }, (conn, request) => {
    conn.setEncoding('utf8')
    conn.write('hello client')
    request.raw.setTimeout(100)
    t.tearDown(conn.destroy.bind(conn))
  })

  fastify.listen(0, err => {
    t.error(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/echo')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.tearDown(client.destroy.bind(client))

    client.once('data', chunk => {
      t.equal(chunk, 'hello client')
    })
  })
})
