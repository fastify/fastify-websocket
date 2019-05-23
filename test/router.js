'use strict'

const test = require('tap').test
const Fastify = require('fastify')
const fastifyWebsocket = require('../')
const websocket = require('websocket-stream')
const get = require('http').get

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
  t.plan(4)
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

test(`Should throw on wrong HTTP method`, t => {
  t.plan(2)
  const fastify = Fastify()

  t.tearDown(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.post('/echo', { websocket: true }, (connection, req) => {
    connection.socket.on('message', message => {
      try {
        connection.socket.send(message)
      } catch (err) {
        connection.socket.send(err.message)
      }
    })
    t.tearDown(connection.destroy.bind(connection))
  })
  fastify.listen(0, (err) => {
    t.ok(err)
    t.equal(err.message, 'websocket handler can only be declared in GET method')
  })
})

test('Should throw on invalid wsHandler', t => {
  t.plan(2)
  const fastify = Fastify()

  t.tearDown(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.route({
    method: 'GET',
    url: '/echo',
    handler: (req, reply) => {
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

test(`Should return 404 on http request`, t => {
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

  fastify.inject({
    method: 'GET',
    url: '/'
  }).then((response) => {
    t.equal(response.payload, '')
    t.equal(response.statusCode, 404)
    t.end()
  })
})
