'use strict'

const test = require('tap').test
const fastify = require('fastify')
const fastifyWebsocket = require('.')
const websocket = require('websocket-stream')

test('expose a websocket', (t) => {
  t.plan(3)

  const server = fastify()
  server.register(fastifyWebsocket, { handle })

  function handle (conn) {
    conn.setEncoding('utf8')
    conn.write('hello client')
    t.tearDown(conn.destroy.bind(conn))

    conn.once('data', (chunk) => {
      t.equal(chunk, 'hello server')
      conn.end()
    })
  }

  t.tearDown(server.close.bind(server))

  server.listen(0, (err) => {
    t.error(err)

    const client = websocket('ws://localhost:' + server.server.address().port)
    t.tearDown(client.destroy.bind(client))

    client.setEncoding('utf8')
    client.write('hello server')

    client.once('data', (chunk) => {
      t.equal(chunk, 'hello client')
      client.end()
    })
  })
})
