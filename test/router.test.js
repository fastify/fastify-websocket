'use strict'

const net = require('node:net')
const { test } = require('node:test')
const Fastify = require('fastify')
const fastifyWebsocket = require('..')
const WebSocket = require('ws')
const get = require('node:http').get

const withResolvers = function () {
  let promiseResolve, promiseReject
  const promise = new Promise((resolve, reject) => {
    promiseResolve = resolve
    promiseReject = reject
  })
  return { promise, resolve: promiseResolve, reject: promiseReject }
}

test('Should expose a websocket on prefixed route', (t, end) => {
  t.plan(4)
  const fastify = Fastify()

  t.after(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.register(
    function (instance, _opts, next) {
      instance.get('/echo', { websocket: true }, function (socket) {
        t.assert.deepStrictEqual(this.prefix, '/baz')
        socket.send('hello client')
        t.after(() => socket.terminate())

        socket.once('message', (chunk) => {
          t.assert.deepStrictEqual(chunk.toString(), 'hello server')
          end()
        })
      })
      next()
    },
    { prefix: '/baz' }
  )

  fastify.listen({ port: 0 }, err => {
    t.assert.ifError(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/baz/echo')
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

test('Should expose a websocket on prefixed route with /', (t, end) => {
  t.plan(3)
  const fastify = Fastify()

  t.after(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.register(
    function (instance, _opts, next) {
      instance.get('/', { websocket: true }, (socket) => {
        socket.send('hello client')
        t.after(() => socket.terminate())

        socket.once('message', (chunk) => {
          t.assert.deepStrictEqual(chunk.toString(), 'hello server')
          end()
        })
      })
      next()
    },
    { prefix: '/baz' }
  )

  fastify.listen({ port: 0 }, err => {
    t.assert.ifError(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/baz')
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

test('Should expose websocket and http route', (t) => {
  t.plan(4)
  const fastify = Fastify()

  t.after(() => fastify.close())

  const { promise: clientPromise, resolve: clientResolve } = withResolvers()
  const { promise: serverPromise, resolve: serverResolve } = withResolvers()

  fastify.register(fastifyWebsocket)
  fastify.register(
    function (instance, _opts, next) {
      instance.route({
        method: 'GET',
        url: '/echo',
        handler: (_request, reply) => {
          reply.send({ hello: 'world' })
        },
        wsHandler: (socket) => {
          socket.send('hello client')
          t.after(() => socket.terminate())

          socket.once('message', (chunk) => {
            t.assert.deepStrictEqual(chunk.toString(), 'hello server')
            clientResolve()
          })
        }
      })
      next()
    },
    { prefix: '/baz' }
  )

  fastify.listen({ port: 0 }, err => {
    t.assert.ifError(err)
    const url = '//localhost:' + (fastify.server.address()).port + '/baz/echo'
    const ws = new WebSocket('ws:' + url)
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.after(() => client.destroy())

    client.setEncoding('utf8')
    client.write('hello server')

    client.once('data', chunk => {
      t.assert.deepStrictEqual(chunk, 'hello client')
      client.end()
    })
    get('http:' + url, function (response) {
      let data = ''

      // A chunk of data has been recieved.
      response.on('data', (chunk) => {
        data += chunk
      })

      // The whole response has been received. Print out the result.
      response.on('end', () => {
        t.assert.deepStrictEqual(data, '{"hello":"world"}')
        serverResolve()
      })
    })
  })

  return Promise.all([clientPromise, serverPromise])
})

test('Should close on unregistered path (with no wildcard route websocket handler defined)', (t, end) => {
  t.plan(2)
  const fastify = Fastify()

  t.after(() => fastify.close())

  fastify
    .register(fastifyWebsocket)
    .register(async function () {
      fastify.get('/*', (_request, reply) => {
        reply.send('hello world')
      })

      fastify.get('/echo', { websocket: true }, (socket) => {
        socket.on('message', message => {
          try {
            socket.send(message)
          } catch (err) {
            socket.send(err.message)
          }
        })

        t.after(() => socket.terminate())
      })
    })

  fastify.listen({ port: 0 }, err => {
    t.assert.ifError(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port)
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.after(() => client.destroy())
    ws.on('close', () => {
      t.assert.ok(true)
      end()
    })
  })
})

test('Should use wildcard websocket route when (with a normal http wildcard route defined as well)', (t, end) => {
  t.plan(2)
  const fastify = Fastify()

  t.after(() => fastify.close())

  fastify
    .register(fastifyWebsocket)
    .register(async function (fastify) {
      fastify.route({
        method: 'GET',
        url: '/*',
        handler: (_, reply) => {
          reply.send({ hello: 'world' })
        },
        wsHandler: (socket) => {
          socket.send('hello client')
          t.after(() => socket.terminate())

          socket.once('message', () => {
            socket.close()
          })
        }
      })
    })

  fastify.listen({ port: 0 }, err => {
    t.assert.ifError(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port)
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.after(() => client.destroy())

    client.once('data', chunk => {
      t.assert.deepStrictEqual(chunk, 'hello client')
      client.end()
      end()
    })
  })
})

test('Should call wildcard route handler on unregistered path', (t, end) => {
  t.plan(3)
  const fastify = Fastify()

  t.after(() => fastify.close())

  fastify
    .register(fastifyWebsocket)
    .register(async function (fastify) {
      fastify.get('/*', { websocket: true }, (socket) => {
        socket.on('message', () => {
          try {
            socket.send('hi from wildcard route handler')
          } catch (err) {
            socket.send(err.message)
          }
        })
        t.after(() => socket.terminate())
      })
    })

  fastify.get('/echo', { websocket: true }, (socket) => {
    socket.on('message', () => {
      try {
        socket.send('hi from /echo handler')
      } catch (err) {
        socket.send(err.message)
      }
    })

    t.after(() => socket.terminate())
  })

  fastify.listen({ port: 0 }, err => {
    t.assert.ifError(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port)
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.after(() => client.destroy())

    ws.on('open', () => {
      ws.send('hi from client')
      client.end()
    })

    ws.on('message', message => {
      t.assert.deepStrictEqual(message.toString(), 'hi from wildcard route handler')
    })

    ws.on('close', () => {
      t.assert.ok(true)
      end()
    })
  })
})

test('Should invoke the correct handler depending on the headers', (t, end) => {
  t.plan(4)
  const fastify = Fastify()

  t.after(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.register(async function () {
    fastify.route({
      method: 'GET',
      url: '/',
      handler: (_request, reply) => {
        reply.send('hi from handler')
      },
      wsHandler: (socket) => {
        socket.send('hi from wsHandler')
        t.after(() => socket.terminate())
      }
    })
  })

  fastify.listen({ port: 0 }, err => {
    t.assert.ifError(err)

    const port = fastify.server.address().port

    const httpClient = net.createConnection({ port }, () => {
      httpClient.write('GET / HTTP/1.1\r\nHOST: localhost\r\n\r\n')
      httpClient.once('data', data => {
        t.assert.match(data.toString(), /hi from handler/i)
        httpClient.end()
      })
    })

    const wsClient = net.createConnection({ port }, () => {
      wsClient.write('GET / HTTP/1.1\r\nConnection: upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n')
      wsClient.once('data', data => {
        t.assert.match(data.toString(), /hi from wsHandler/i)
        wsClient.end(() => {
          t.assert.ok(true)
          setTimeout(end, 100)
        })
      })
    })
  })
})

test('Should call the wildcard handler if a no other non-websocket route with path exists', (t, end) => {
  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(async function (fastify) {
    fastify.get('/*', { websocket: true }, (socket) => {
      t.assert.ok('called', 'wildcard handler')
      socket.close()
      t.after(() => socket.terminate())
    })

    fastify.get('/http', (_request, reply) => {
      t.assert.fail('Should not call http handler')
      reply.send('http route')
    })
  })

  fastify.listen({ port: 0 }, err => {
    t.assert.ifError(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/http2')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.after(() => client.destroy())

    client.setEncoding('utf8')
    client.end(end)
  })
})

test('Should close the connection if a non-websocket route with path exists', (t, end) => {
  t.plan(2)
  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.register(async function (fastify) {
    fastify.get('/*', { websocket: true }, (socket) => {
      t.assert.fail('called', 'wildcard handler')
      t.after(() => socket.terminate())
    })

    fastify.get('/http', (_request, reply) => {
      t.assert.fail('Should not call /http handler')
      reply.send('http route')
    })
  })

  fastify.listen({ port: 0 }, err => {
    t.assert.ifError(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/http')
    ws.on('close', (code) => {
      t.assert.deepStrictEqual(code, 1005, 'closed websocket')
      end()
    })
  })
})

test('Should throw on wrong HTTP method', (t, end) => {
  t.plan(2)
  const fastify = Fastify()

  t.after(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.register(async function (fastify) {
    fastify.post('/echo', { websocket: true }, (socket) => {
      socket.on('message', message => {
        try {
          socket.send(message)
        } catch (err) {
          socket.send(err.message)
        }
      })
      t.after(() => socket.terminate())
    })

    fastify.get('/http', (_request, reply) => {
      t.assert.fail('Should not call /http handler')
      reply.send('http route')
    })
  })

  fastify.listen({ port: 0 }, (err) => {
    t.assert.ok(err)
    t.assert.deepStrictEqual(err.message, 'websocket handler can only be declared in GET method')
    end()
  })
})

test('Should throw on invalid wsHandler', async t => {
  t.plan(1)
  const fastify = Fastify()

  t.after(() => fastify.close())

  await fastify.register(fastifyWebsocket)
  try {
    fastify.route({
      method: 'GET',
      url: '/echo',
      handler: (_, reply) => {
        reply.send({ hello: 'world' })
      },
      wsHandler: 'hello'
    }, { prefix: '/baz' })
  } catch (err) {
    t.assert.deepStrictEqual(err.message, 'invalid wsHandler function')
  }
})

test('Should open on registered path', (t, end) => {
  t.plan(2)
  const fastify = Fastify()

  t.after(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(async function (fastify) {
    fastify.get('/echo', { websocket: true }, (socket) => {
      socket.on('message', message => {
        try {
          socket.send(message)
        } catch (err) {
          socket.send(err.message)
        }
      })

      t.after(() => socket.terminate())
    })
  })

  fastify.listen({ port: 0 }, err => {
    t.assert.ifError(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/echo')
    ws.on('open', () => {
      t.assert.ok(true)
      client.end()
      end()
    })

    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.after(() => client.destroy())
  })
})

test('Should send message and close', (t) => {
  t.plan(5)
  const fastify = Fastify()

  t.after(() => fastify.close())

  fastify.register(fastifyWebsocket)

  const { promise: clientPromise, resolve: clientResolve } = withResolvers()
  const { promise: serverPromise, resolve: serverResolve } = withResolvers()

  fastify.register(async function (fastify) {
    fastify.get('/', { websocket: true }, (socket) => {
      socket.on('message', message => {
        t.assert.deepStrictEqual(message.toString(), 'hi from client')
        socket.send('hi from server')
      })

      socket.on('close', () => {
        t.assert.ok(true)
        serverResolve()
      })

      t.after(() => socket.terminate())
    })
  })

  fastify.listen({ port: 0 }, err => {
    t.assert.ifError(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.after(() => client.destroy())

    ws.on('message', message => {
      t.assert.deepStrictEqual(message.toString(), 'hi from server')
    })

    ws.on('open', () => {
      ws.send('hi from client')
      client.end()
    })

    ws.on('close', () => {
      t.assert.ok(true)
      clientResolve()
    })
  })

  return Promise.all([clientPromise, serverPromise])
})

test('Should return 404 on http request', (t, end) => {
  const fastify = Fastify()

  t.after(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.register(async function (fastify) {
    fastify.get('/', { websocket: true }, (socket) => {
      socket.on('message', message => {
        t.assert.deepStrictEqual(message.toString(), 'hi from client')
        socket.send('hi from server')
      })

      socket.on('close', () => {
        t.assert.ok(true)
      })

      t.after(() => socket.terminate())
    })
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }).then((response) => {
    t.assert.deepStrictEqual(response.payload, '')
    t.assert.deepStrictEqual(response.statusCode, 404)
    end()
  })
})

test('Should pass route params to per-route handlers', (t, end) => {
  const fastify = Fastify()

  t.after(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, (socket, request) => {
      const params = request.params
      t.assert.deepStrictEqual(Object.keys(params).length, 0, 'params are empty')
      socket.send('empty')
      socket.close()
    })
    fastify.get('/ws/:id', { websocket: true }, (socket, request) => {
      const params = request.params
      t.assert.deepStrictEqual(params.id, 'foo', 'params are correct')
      socket.send(params.id)
      socket.close()
    })
  })

  fastify.listen({ port: 0 }, err => {
    let pending = 2
    t.assert.ifError(err)
    const ws = new WebSocket(
      'ws://localhost:' + (fastify.server.address()).port + '/ws/foo'
    )
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    const ws2 = new WebSocket(
      'ws://localhost:' + (fastify.server.address()).port + '/ws'
    )
    const client2 = WebSocket.createWebSocketStream(ws2, { encoding: 'utf8' })
    t.after(() => client.destroy())
    t.after(() => client2.destroy())

    client.setEncoding('utf8')
    client2.setEncoding('utf8')

    client.once('data', chunk => {
      t.assert.deepStrictEqual(chunk, 'foo')
      client.end()
      if (--pending === 0) end()
    })
    client2.once('data', chunk => {
      t.assert.deepStrictEqual(chunk, 'empty')
      client2.end()
      if (--pending === 0) end()
    })
  })
})

test('Should not throw error when register empty get with prefix', (t, end) => {
  const fastify = Fastify()

  t.after(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(
    function (instance, _opts, next) {
      instance.get('/', { websocket: true }, (socket) => {
        socket.on('message', message => {
          t.assert.deepStrictEqual(message.toString(), 'hi from client')
          socket.send('hi from server')
        })
      })
      next()
    },
    { prefix: '/baz' }
  )

  fastify.listen({ port: 0 }, err => {
    if (err) t.assert.ifError(err)

    const ws = new WebSocket(
      'ws://localhost:' + fastify.server.address().port + '/baz/'
    )

    ws.on('open', () => {
      t.assert.ok('Done')
      ws.close()
      end()
    })
  })
})

test('Should expose fastify instance to websocket per-route handler', (t, end) => {
  const fastify = Fastify()

  t.after(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, function wsHandler (socket) {
      t.assert.deepStrictEqual(this, fastify, 'this is bound to fastify server')
      socket.send('empty')
      socket.close()
    })
  })

  fastify.listen({ port: 0 }, err => {
    t.assert.ifError(err)
    const ws = new WebSocket(
      'ws://localhost:' + (fastify.server.address()).port + '/ws'
    )
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.after(() => client.destroy())

    client.setEncoding('utf8')

    client.once('data', chunk => {
      t.assert.deepStrictEqual(chunk, 'empty')
      client.end()
      end()
    })
  })
})

test('Should have access to decorators in per-route handler', (t, end) => {
  const fastify = Fastify()

  t.after(() => fastify.close())

  fastify.decorateRequest('str', 'it works!')
  fastify.register(fastifyWebsocket)
  fastify.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, function wsHandler (socket, request) {
      t.assert.deepStrictEqual(request.str, 'it works!', 'decorator is accessible')
      socket.send('empty')
      socket.close()
    })
  })

  fastify.listen({ port: 0 }, err => {
    t.assert.ifError(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/ws')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.after(() => client.destroy())

    client.once('data', chunk => {
      t.assert.deepStrictEqual(chunk, 'empty')
      client.end()
      end()
    })
  })
})

test('should call `destroy` when exception is thrown inside async handler', (t, end) => {
  t.plan(2)
  const fastify = Fastify()

  t.after(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, async function wsHandler (socket) {
      socket.on('close', code => {
        t.assert.deepStrictEqual(code, 1006)
        end()
      })
      throw new Error('something wrong')
    })
  })

  fastify.listen({ port: 0 }, err => {
    t.assert.ifError(err)
    const ws = new WebSocket(
      'ws://localhost:' + (fastify.server.address()).port + '/ws'
    )
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })

    client.on('error', (_) => { })
    t.after(() => client.destroy())
  })
})

test('should call default non websocket fastify route when no match is found', (t, end) => {
  t.plan(2)
  const fastify = Fastify()

  t.after(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.register(async function (fastify) {
    fastify.get('/ws', function handler (_request, reply) {
      reply.send({ hello: 'world' })
    })
  })

  fastify.listen({ port: 0 }, err => {
    t.assert.ifError(err)
    get('http://localhost:' + (fastify.server.address()).port + '/wrong-route', function (response) {
      t.assert.deepStrictEqual(response.statusCode, 404)
      end()
    })
  })
})

test('register a non websocket route', (t, end) => {
  t.plan(2)
  const fastify = Fastify()

  t.after(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.register(async function (fastify) {
    fastify.get('/ws', function handler (_request, reply) {
      reply.send({ hello: 'world' })
    })
  })

  fastify.listen({ port: 0 }, err => {
    t.assert.ifError(err)
    get('http://localhost:' + (fastify.server.address()).port + '/ws', function (response) {
      let data = ''

      response.on('data', (chunk) => {
        data += chunk
      })

      response.on('end', () => {
        t.assert.deepStrictEqual(data, '{"hello":"world"}')
        end()
      })
    })
  })
})
