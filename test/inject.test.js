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
  t.plan(1)

  const fastify = buildFastify(t)
  const message = 'hi from client'

  let resolve
  const promise = new Promise(_resolve => {
    resolve = _resolve
  })
  fastify.register(
    function (instance, opts, done) {
      instance.get('/ws', { websocket: true }, function (conn) {
        conn.once('data', chunk => {
          resolve(chunk.toString())
        })
      })

      done()
    })

  await fastify.ready()
  const ws = await fastify.injectWS('/ws')
  ws.send(message)

  t.same(await promise, message)
  t.end()
})
