'use strict'

const test = require('tap').test
const Fastify = require('fastify')
const fastifyWebsocket = require('..')
const { ValidateWebSocket } = require('..')
const WebSocket = require('ws')

const testSchema = {
  body: {
    oneOf: [
      { type: 'null' },
      {
        type: 'object',
        properties: {
          foo: {
            type: 'string'
          }
        },
        required: [
          'foo'
        ],
        additionalProperties: false
      }
    ]
  }
}
const schemaError = [
  { keyword: 'type', dataPath: '', schemaPath: '#/oneOf/0/type', params: { type: 'null' }, message: 'should be null' },
  { keyword: 'required', dataPath: '', schemaPath: '#/oneOf/1/required', params: { missingProperty: 'foo' }, message: "should have required property 'foo'" },
  { keyword: 'oneOf', dataPath: '', schemaPath: '#/oneOf', params: { passingSchemas: null }, message: 'should match exactly one schema in oneOf' }
]

test('Should validate a websocket message', (t) => {
  t.plan(3)

  const fastify = Fastify()
  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket, { options: { WebSocket: ValidateWebSocket } })

  fastify.get('/', { websocket: true, schema: testSchema }, (connection, request) => {
    connection.socket.on('message', (message, isBinary) => {
      t.equal(isBinary, false)
      t.same(message, { foo: 'bar' })
      t.teardown(connection.destroy.bind(connection))
    })
  })

  fastify.listen(0, (err) => {
    t.error(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/')
    ws.on('open', e => {
      ws.send(JSON.stringify({ foo: 'bar' }))
    })
  })
})

test('Should not validate a websocket binary message', (t) => {
  t.plan(2)

  const fastify = Fastify()
  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket, { options: { WebSocket: ValidateWebSocket } })

  fastify.get('/', { websocket: true, schema: testSchema }, (connection, request) => {
    connection.socket.on('message', (message, isBinary) => {
      t.equal(isBinary, true)
      t.teardown(connection.destroy.bind(connection))
    })
  })

  fastify.listen(0, (err) => {
    t.error(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/')
    ws.on('open', e => {
      const array = new Float32Array(5)
      for (let i = 0; i < array.length; ++i) {
        array[i] = i / 2
      }
      ws.send(array)
    })
  })
})

test('Should invalidate a websocket message strict mode True', (t) => {
  t.plan(2)
  const fastify = Fastify()
  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket, { strictMode: true, options: { WebSocket: ValidateWebSocket } })

  fastify.get('/', { websocket: true, schema: testSchema }, (connection, request) => {
    connection.socket.on('error', err => {
      t.error(err)
    })
    connection.socket.on('message', (message, isBinary) => {
      t.error(message, 'Should not reach the event handler')
    })
  })
  fastify.listen(0, (err) => {
    t.error(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/')
    ws.on('open', e => {
      ws.send(JSON.stringify({ bar: 'foo' }))
    })
    ws.on('close', (code, reason) => {
      t.equal(code, 1003)
    })
  })
})

test('Should invalidate a malformed websocket message strict mode True', (t) => {
  t.plan(2)
  const fastify = Fastify()
  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket, { strictMode: true, options: { WebSocket: ValidateWebSocket } })

  fastify.get('/', { websocket: true, schema: testSchema }, (connection, request) => {
    connection.socket.on('error', err => {
      t.error(err)
    })
    connection.socket.on('message', (message, isBinary) => {
      t.error(message, 'Should not reach the event handler')
    })
  })
  fastify.listen(0, (err) => {
    t.error(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/')
    ws.on('open', e => {
      ws.send(JSON.stringify({ foo: 'bar' }) + '}')
    })
    ws.on('close', (code, reason) => {
      t.equal(code, 1003)
    })
  })
})

test('Should invalidate a websocket message strict mode False', (t) => {
  t.plan(3)
  const fastify = Fastify()
  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket, { strictMode: false, options: { WebSocket: ValidateWebSocket } })

  fastify.get('/', { websocket: true, schema: testSchema }, (connection, request) => {
    connection.socket.on('error', err => {
      t.error(err)
    })
    connection.socket.on('message', (message, isBinary) => {
      t.error(message, 'Should not reach the event handler')
    })
  })
  fastify.listen(0, (err) => {
    t.error(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/')
    ws.on('open', e => {
      ws.send(JSON.stringify({ bar: 'foo' }))
    })
    ws.on('message', (data, isBinary) => {
      t.equal(isBinary, false)
      const jsonResponse = JSON.parse(data.toString())
      t.same(jsonResponse, schemaError)
    })
  })
})

test('Should invalidate a malformed websocket message strict mode False', (t) => {
  t.plan(3)
  const fastify = Fastify()
  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket, { strictMode: false, options: { WebSocket: ValidateWebSocket } })

  fastify.get('/', { websocket: true, schema: testSchema }, (connection, request) => {
    connection.socket.on('error', err => {
      t.error(err)
    })
    connection.socket.on('message', (message, isBinary) => {
      t.error(message, 'Should not reach the event handler')
    })
  })
  fastify.listen(0, (err) => {
    t.error(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/')
    ws.on('open', e => {
      ws.send(JSON.stringify({ foo: 'bar' }) + '}')
    })
    ws.on('message', (data, isBinary) => {
      t.equal(isBinary, false)
      t.equal(data.toString(), 'Unsupported payload')
    })
  })
})
