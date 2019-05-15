'use strict'

const http = require('http')
const test = require('tap').test
const Fastify = require('fastify')
const fastifyWebsocket = require('.')
const websocket = require('websocket-stream')
const request = require('request')

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

    const client = websocket('ws://localhost:' + fastify.server.address().port)
    t.tearDown(() => client.destroy())

    client.setEncoding('utf8')
    client.write('hello server')

    client.once('data', (chunk) => {
      t.equal(chunk, 'hello client')
      client.end()
    })
  })
})

test('Should expose a websocket on prefixed route', t => {
  t.plan(3)
  const fastify = Fastify()

  t.tearDown(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.register(
    function (instance, opts, next) {
      instance.get('/echo', { websocket: true }, (conn, req) => {
        conn.setEncoding('utf8')
        conn.write('hello client')
        t.tearDown(conn.destroy.bind(conn))

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
    const client = websocket(
      'ws://localhost:' + (fastify.server.address()).port + '/baz/echo'
    )
    t.tearDown(client.destroy.bind(client))

    client.setEncoding('utf8')
    client.write('hello server')

    client.once('data', chunk => {
      t.equal(chunk, 'hello client')
      client.end()
    })
  })
})

test('Should expose websocket and http route', t => {
  t.plan(6)
  const fastify = Fastify()

  t.tearDown(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.register(
    function (instance, opts, next) {
      instance.route({
        method: 'GET',
        url: '/echo',
        handler: (req, reply) => {
          reply.send({ hello: 'world' })
        },
        wsHandler: (conn, req) => {
          conn.setEncoding('utf8')
          conn.write('hello client')
          t.tearDown(conn.destroy.bind(conn))

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
    const client = websocket('ws:' + url)
    t.tearDown(client.destroy.bind(client))

    client.setEncoding('utf8')
    client.write('hello server')

    client.once('data', chunk => {
      t.equal(chunk, 'hello client')
      client.end()
    })
    request('http:' + url, function (error, response, body) {
      t.error(error)
      t.equal(response.statusCode, 200)
      t.equal(body, '{"hello":"world"}')
    })
  })
})

test(`Should close on unregistered path`, t => {
  t.plan(2)
  const fastify = Fastify()

  t.tearDown(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.get('/echo', { websocket: true }, (connection, req) => {
    connection.socket.on('message', message => {
      try {
        connection.socket.send(message)
      } catch (err) {
        connection.socket.send(err.message)
      }
    })

    t.tearDown(connection.destroy.bind(connection))
  })

  fastify.listen(0, err => {
    t.error(err)
    const client = websocket('ws://localhost:' + (fastify.server.address()).port)
    t.tearDown(client.destroy.bind(client))

    client.socket.on('close', () => {
      t.pass()
    })
  })
})

test(`Should open on registered path`, t => {
  t.plan(2)
  const fastify = Fastify()

  t.tearDown(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.get('/echo', { websocket: true }, (connection, req) => {
    connection.socket.on('message', message => {
      try {
        connection.socket.send(message)
      } catch (err) {
        connection.socket.send(err.message)
      }
    })

    t.tearDown(connection.destroy.bind(connection))
  })

  fastify.listen(0, err => {
    t.error(err)
    const client = websocket('ws://localhost:' + (fastify.server.address()).port + '/echo/')
    t.tearDown(client.destroy.bind(client))

    client.socket.on('open', () => {
      t.pass()
      client.end()
    })
  })
})

test(`Should send message and close`, t => {
  t.plan(5)
  const fastify = Fastify()

  t.tearDown(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.get('/', { websocket: true }, (connection, req) => {
    connection.socket.on('message', message => {
      t.equal(message, 'hi from client')
      connection.socket.send('hi from server')
    })

    connection.socket.on('close', () => {
      t.pass()
    })

    t.tearDown(connection.destroy.bind(connection))
  })

  fastify.listen(0, err => {
    t.error(err)
    const client = websocket('ws://localhost:' + (fastify.server.address()).port + '/')
    t.tearDown(client.destroy.bind(client))
    client.socket.on('message', message => {
      t.equal(message, 'hi from server')
    })

    client.socket.on('open', () => {
      client.socket.send('hi from client')
      client.end()
    })

    client.socket.on('close', () => {
      t.pass()
    })
  })
})

test(`Should return 404 on http request`, async t => {
  const fastify = Fastify()

  t.tearDown(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.get('/', { websocket: true }, (connection, req) => {
    connection.socket.on('message', message => {
      t.equal(message, 'hi from client')
      connection.socket.send('hi from server')
    })

    connection.socket.on('close', () => {
      t.pass()
    })

    t.tearDown(connection.destroy.bind(connection))
  })

  const response = await fastify.inject({
    method: 'GET',
    url: '/'
  })
  t.equal(response.payload, '')
  t.equal(response.statusCode, 404)
  t.end()
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
    const client = websocket('ws://localhost:' + fastify.server.address().port, clientOptions)
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

    const client = websocket('ws://localhost:' + externalServerPort)
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
