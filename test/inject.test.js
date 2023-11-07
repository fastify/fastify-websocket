'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const fastifyWebsocket = require('..')

function buildFastify (t) {
  const fastify = Fastify()
  t.teardown(() => { fastify.close() })
  fastify.register(fastifyWebsocket)
  return fastify
}

test('routes correctly the message', async (t) => {
  const fastify = buildFastify(t)
  const message = 'hi from client'

  let _resolve
  const promise = new Promise((resolve) => { _resolve = resolve })

  fastify.register(
    async function (instance) {
      instance.get('/ws', { websocket: true }, function (conn) {
        conn.once('data', chunk => {
          _resolve(chunk.toString())
        })
      })
    })

  await fastify.ready()
  const ws = await fastify.injectWS('/ws')
  ws.send(message)
  t.same(await promise, message)
  ws.terminate()
})

test('redirect on / if no path specified', async (t) => {
  const fastify = buildFastify(t)
  const message = 'hi from client'

  let _resolve
  const promise = new Promise((resolve) => { _resolve = resolve })

  fastify.register(
    async function (instance) {
      instance.get('/', { websocket: true }, function (conn) {
        conn.once('data', chunk => {
          _resolve(chunk.toString())
        })
      })
    })

  await fastify.ready()
  const ws = await fastify.injectWS()
  ws.send(message)
  t.same(await promise, message)
  ws.terminate()
})

test('routes correctly the message between two routes', async (t) => {
  const fastify = buildFastify(t)
  const message = 'hi from client'

  let _resolve
  let _reject
  const promise = new Promise((resolve, reject) => { _resolve = resolve; _reject = reject })

  fastify.register(
    async function (instance) {
      instance.get('/ws', { websocket: true }, function (conn) {
        conn.once('data', () => {
          _reject('wrong-route')
        })
      })

      instance.get('/ws-2', { websocket: true }, function (conn) {
        conn.once('data', chunk => {
          _resolve(chunk.toString())
        })
      })
    })

  await fastify.ready()
  const ws = await fastify.injectWS('/ws-2')
  ws.send(message)
  t.same(await promise, message)
  ws.terminate()
})
