'use strict'

const net = require('net')
const test = require('tap').test
const Fastify = require('fastify')
const fastifyWebsocket = require('..')
const WebSocket = require('ws')
const get = require('http').get

test('Should expose a websocket on prefixed route', t => {
  t.plan(4)
  const fastify = Fastify()

  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.register(
    function (instance, opts, next) {
      instance.get('/echo', { websocket: true }, function (conn, request) {
        t.equal(this.prefix, '/baz')
        conn.setEncoding('utf8')
        conn.write('hello client')
        t.teardown(conn.destroy.bind(conn))

        conn.once('data', chunk => {
          t.equal(chunk, 'hello server')
          conn.end()
        })
      })
      next()
    },
    { prefix: '/baz' }
  )

  fastify.listen(0, err => {
    t.error(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/baz/echo')
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

test('Should expose a websocket on prefixed route with /', t => {
  t.plan(3)
  const fastify = Fastify()

  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.register(
    function (instance, opts, next) {
      instance.get('/', { websocket: true }, (conn, req) => {
        conn.setEncoding('utf8')
        conn.write('hello client')
        t.teardown(conn.destroy.bind(conn))

        conn.once('data', chunk => {
          t.equal(chunk, 'hello server')
          conn.end()
        })
      })
      next()
    },
    { prefix: '/baz' }
  )

  fastify.listen(0, err => {
    t.error(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/baz')
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

test('Should expose websocket and http route', t => {
  t.plan(4)
  const fastify = Fastify()

  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.register(
    function (instance, opts, next) {
      instance.route({
        method: 'GET',
        url: '/echo',
        handler: (request, reply) => {
          reply.send({ hello: 'world' })
        },
        wsHandler: (conn, req) => {
          conn.setEncoding('utf8')
          conn.write('hello client')
          t.teardown(conn.destroy.bind(conn))

          conn.once('data', chunk => {
            t.equal(chunk, 'hello server')
            conn.end()
          })
        }
      })
      next()
    },
    { prefix: '/baz' }
  )

  fastify.listen(0, err => {
    t.error(err)
    const url = '//localhost:' + (fastify.server.address()).port + '/baz/echo'
    const ws = new WebSocket('ws:' + url)
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.teardown(client.destroy.bind(client))

    client.setEncoding('utf8')
    client.write('hello server')

    client.once('data', chunk => {
      t.equal(chunk, 'hello client')
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
        t.equal(data, '{"hello":"world"}')
      })
    })
  })
})

test('Should close on unregistered path (with no wildcard route websocket handler defined)', t => {
  t.plan(2)
  const fastify = Fastify()

  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.get('/*', (request, reply) => {
    reply.send('hello world')
  })

  fastify.get('/echo', { websocket: true }, (connection, request) => {
    connection.socket.on('message', message => {
      try {
        connection.socket.send(message)
      } catch (err) {
        connection.socket.send(err.message)
      }
    })

    t.teardown(connection.destroy.bind(connection))
  })

  fastify.listen(0, err => {
    t.error(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port)
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.teardown(client.destroy.bind(client))
    ws.on('close', () => {
      t.pass()
    })
  })
})

test('Should use wildcard websocket route when (with a normal http wildcard route defined as well)', t => {
  t.plan(2)
  const fastify = Fastify()

  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.route({
    method: 'GET',
    url: '/*',
    handler: (req, reply) => {
      reply.send({ hello: 'world' })
    },
    wsHandler: (conn, req) => {
      conn.setEncoding('utf8')
      conn.write('hello client')

      conn.once('data', chunk => {
        conn.end()
      })
    }
  })

  fastify.listen(0, err => {
    t.error(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port)
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.teardown(client.destroy.bind(client))

    client.once('data', chunk => {
      t.equal(chunk, 'hello client')
      client.end()
    })
  })
})

test('Should call wildcard route handler on unregistered path', t => {
  t.plan(3)
  const fastify = Fastify()

  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.get('/*', { websocket: true }, (conn, request) => {
    conn.socket.on('message', message => {
      try {
        conn.socket.send('hi from wildcard route handler')
      } catch (err) {
        conn.socket.send(err.message)
      }
    })

    t.teardown(conn.destroy.bind(conn))
  })

  fastify.get('/echo', { websocket: true }, (conn, request) => {
    conn.socket.on('message', message => {
      try {
        conn.socket.send('hi from /echo handler')
      } catch (err) {
        conn.socket.send(err.message)
      }
    })

    t.teardown(conn.destroy.bind(conn))
  })

  fastify.listen(0, err => {
    t.error(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port)
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.teardown(client.destroy.bind(client))

    ws.on('open', () => {
      ws.send('hi from client')
      client.end()
    })

    ws.on('message', message => {
      t.equal(message.toString(), 'hi from wildcard route handler')
    })

    ws.on('close', () => {
      t.pass()
    })
  })
})

test('Should invoke the correct handler depending on the headers', t => {
  t.plan(4)
  const fastify = Fastify()

  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.route({
    method: 'GET',
    url: '/',
    handler: (request, reply) => {
      reply.send('hi from handler')
    },
    wsHandler: (conn, request) => {
      conn.write('hi from wsHandler')
      t.teardown(conn.destroy.bind(conn))
    }
  })

  fastify.listen(0, err => {
    t.error(err)

    const port = fastify.server.address().port

    const httpClient = net.createConnection({ port: port }, () => {
      httpClient.write('GET / HTTP/1.1\r\n\r\n')
      httpClient.once('data', data => {
        t.match(data.toString(), /hi from handler/i)
        httpClient.end()
      })
    })

    const wsClient = net.createConnection({ port: port }, () => {
      wsClient.write('GET / HTTP/1.1\r\nConnection: upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n')
      wsClient.once('data', data => {
        t.match(data.toString(), /hi from wsHandler/i)
        wsClient.end(() => { t.pass() })
      })
    })
  })
})

test('Should call the wildcard handler if a no other non-websocket route with path exists', t => {
  t.plan(2)
  const fastify = Fastify()
  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.get('/*', { websocket: true }, (conn, request) => {
    t.ok('called', 'wildcard handler')
    t.teardown(conn.destroy.bind(conn))
  })

  fastify.get('/http', (request, reply) => {
    t.fail('Should not call http handler')
    reply.send('http route')
  })

  fastify.listen(0, err => {
    t.error(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/http2')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.teardown(client.destroy.bind(client))

    client.setEncoding('utf8')
    client.end(() => { t.end() })
  })
})

test('Should close the connection if a non-websocket route with path exists', t => {
  t.plan(2)
  const fastify = Fastify()
  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.get('/*', { websocket: true }, (conn, request) => {
    t.fail('called', 'wildcard handler')
    t.teardown(conn.destroy.bind(conn))
  })

  fastify.get('/http', (request, reply) => {
    t.fail('Should not call /http handler')
    reply.send('http route')
  })

  fastify.listen(0, err => {
    t.error(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/http')
    ws.on('close', (code) => {
      t.equal(code, 1005, 'closed websocket')
      t.end()
    })
  })
})

test('Should throw on wrong HTTP method', t => {
  t.plan(2)
  const fastify = Fastify()

  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.post('/echo', { websocket: true }, (connection, request) => {
    connection.socket.on('message', message => {
      try {
        connection.socket.send(message)
      } catch (err) {
        connection.socket.send(err.message)
      }
    })
    t.teardown(connection.destroy.bind(connection))
  })
  fastify.listen(0, (err) => {
    t.ok(err)
    t.equal(err.message, 'websocket handler can only be declared in GET method')
  })
})

test('Should throw on invalid wsHandler', t => {
  t.plan(2)
  const fastify = Fastify()

  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.route({
    method: 'GET',
    url: '/echo',
    handler: (request, reply) => {
      reply.send({ hello: 'world' })
    },
    wsHandler: 'hello'
  },
  { prefix: '/baz' })

  fastify.listen(0, err => {
    t.ok(err)
    t.equal(err.message, 'invalid wsHandler function')
  })
})

test('Should open on registered path', t => {
  t.plan(2)
  const fastify = Fastify()

  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.get('/echo', { websocket: true }, (connection, request) => {
    connection.socket.on('message', message => {
      try {
        connection.socket.send(message)
      } catch (err) {
        connection.socket.send(err.message)
      }
    })

    t.teardown(connection.destroy.bind(connection))
  })

  fastify.listen(0, err => {
    t.error(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/echo/')
    ws.on('open', () => {
      t.pass()
      client.end()
    })

    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.teardown(client.destroy.bind(client))
  })
})

test('Should send message and close', t => {
  t.plan(5)
  const fastify = Fastify()

  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.get('/', { websocket: true }, (connection, request) => {
    connection.socket.on('message', message => {
      t.equal(message.toString(), 'hi from client')
      connection.socket.send('hi from server')
    })

    connection.socket.on('close', () => {
      t.pass()
    })

    t.teardown(connection.destroy.bind(connection))
  })

  fastify.listen(0, err => {
    t.error(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.teardown(client.destroy.bind(client))

    ws.on('message', message => {
      t.equal(message.toString(), 'hi from server')
    })

    ws.on('open', () => {
      ws.send('hi from client')
      client.end()
    })

    ws.on('close', () => {
      t.pass()
    })
  })
})

test('Should return 404 on http request', t => {
  const fastify = Fastify()

  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.get('/', { websocket: true }, (connection, request) => {
    connection.socket.on('message', message => {
      t.equal(message.toString(), 'hi from client')
      connection.socket.send('hi from server')
    })

    connection.socket.on('close', () => {
      t.pass()
    })

    t.teardown(connection.destroy.bind(connection))
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }).then((response) => {
    t.equal(response.payload, '')
    t.equal(response.statusCode, 404)
    t.end()
  })
})

test('Should pass route params to per-route handlers', t => {
  const fastify = Fastify()

  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.get('/ws', { websocket: true }, (conn, request) => {
    const params = request.params
    t.equal(Object.keys(params).length, 0, 'params are empty')
    conn.write('empty')
    conn.end()
  })
  fastify.get('/ws/:id', { websocket: true }, (conn, request) => {
    const params = request.params
    t.equal(params.id, 'foo', 'params are correct')
    conn.write(params.id)
    conn.end()
  })

  fastify.listen(0, err => {
    let pending = 2
    t.error(err)
    const ws = new WebSocket(
      'ws://localhost:' + (fastify.server.address()).port + '/ws/foo'
    )
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    const ws2 = new WebSocket(
      'ws://localhost:' + (fastify.server.address()).port + '/ws'
    )
    const client2 = WebSocket.createWebSocketStream(ws2, { encoding: 'utf8' })
    t.teardown(client.destroy.bind(client))
    t.teardown(client2.destroy.bind(client2))

    client.setEncoding('utf8')
    client2.setEncoding('utf8')

    client.once('data', chunk => {
      t.equal(chunk, 'foo')
      client.end()
      if (--pending === 0) t.end()
    })
    client2.once('data', chunk => {
      t.equal(chunk, 'empty')
      client2.end()
      if (--pending === 0) t.end()
    })
  })
})

test('Should not throw error when register empty get with prefix', t => {
  const fastify = Fastify()

  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(
    function (instance, opts, next) {
      instance.get('/', { websocket: true }, (connection, request) => {
        connection.socket.on('message', message => {
          t.equal(message.toString(), 'hi from client')
          connection.socket.send('hi from server')
        })
      })
      next()
    },
    { prefix: '/baz' }
  )

  fastify.listen(0, err => {
    if (err) t.error(err)

    const ws = new WebSocket(
      'ws://localhost:' + fastify.server.address().port + '/baz/'
    )

    ws.on('open', () => {
      t.pass('Done')
      ws.close()
      t.end()
    })
  })
})

test('Should expose fastify instance to websocket per-route handler', t => {
  const fastify = Fastify()

  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.get('/ws', { websocket: true }, function wsHandler (conn, request) {
    t.equal(this, fastify, 'this is bound to fastify server')
    conn.write('empty')
    conn.end()
  })

  fastify.listen(0, err => {
    t.error(err)
    const ws = new WebSocket(
      'ws://localhost:' + (fastify.server.address()).port + '/ws'
    )
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.teardown(client.destroy.bind(client))

    client.setEncoding('utf8')

    client.once('data', chunk => {
      t.equal(chunk, 'empty')
      client.end()
      t.end()
    })
  })
})

test('Should have access to decorators in per-route handler', t => {
  const fastify = Fastify()

  t.teardown(() => fastify.close())

  fastify.decorateRequest('str', 'it works!')
  fastify.register(fastifyWebsocket)
  fastify.get('/ws', { websocket: true }, function wsHandler (conn, request) {
    t.equal(request.str, 'it works!', 'decorator is accessible')
    conn.write('empty')
    conn.end()
  })

  fastify.listen(0, err => {
    t.error(err)
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/ws')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    t.teardown(client.destroy.bind(client))

    client.once('data', chunk => {
      t.equal(chunk, 'empty')
      client.end()
      t.end()
    })
  })
})

test('should call `destroy` when exception is thrown inside async handler', t => {
  t.plan(2)
  const fastify = Fastify()

  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.get('/ws', { websocket: true }, async function wsHandler (conn, request) {
    conn.on('error', err => {
      t.equal(err.message, 'something wrong')
      t.end()
    })
    throw new Error('something wrong')
  })

  fastify.listen(0, err => {
    t.error(err)
    const ws = new WebSocket(
      'ws://localhost:' + (fastify.server.address()).port + '/ws'
    )
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })

    client.on('error', (_) => { })
    t.teardown(client.destroy.bind(client))
  })
})

test('should call default non websocket fastify route when no match is found', t => {
  t.plan(2)
  const fastify = Fastify()

  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.get('/ws', function handler (request, reply) {
    reply.send({ hello: 'world' })
  })

  fastify.listen(0, err => {
    t.error(err)
    get('http://localhost:' + (fastify.server.address()).port + '/wrong-route', function (response) {
      t.equal(response.statusCode, 404)
      t.end()
    })
  })
})

test('register a non websocket route', t => {
  t.plan(2)
  const fastify = Fastify()

  t.teardown(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.get('/ws', function handler (request, reply) {
    reply.send({ hello: 'world' })
  })

  fastify.listen(0, err => {
    t.error(err)
    get('http://localhost:' + (fastify.server.address()).port + '/ws', function (response) {
      let data = ''

      response.on('data', (chunk) => {
        data += chunk
      })

      response.on('end', () => {
        t.equal(data, '{"hello":"world"}')
        t.end()
      })
    })
  })
})
