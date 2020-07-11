'use strict'

const { ServerResponse } = require('http')
const fp = require('fastify-plugin')
const WebSocket = require('ws')
const findMyWay = require('find-my-way')

const kWs = Symbol('ws')

function fastifyWebsocket (fastify, opts, next) {
  if (opts.handle && typeof opts.handle !== 'function') {
    return next(new Error('invalid handle function'))
  }
  const handle = opts.handle
    ? (req, res) => opts.handle.call(fastify, req[kWs], req)
    : (req, res) => {
      req[kWs].socket.close()
    }

  const options = Object.assign({ server: fastify.server }, opts.options)

  const router = findMyWay({
    ignoreTrailingSlash: true,
    defaultRoute: handle
  })

  const wss = new WebSocket.Server(options)
  wss.on('connection', handleRouting)

  fastify.decorate('websocketServer', wss)

  fastify.addHook('onRoute', routeOptions => {
    if (routeOptions.websocket || routeOptions.wsHandler) {
      if (routeOptions.method !== 'GET') {
        throw new Error('websocket handler can only be declared in GET method')
      }

      if (routeOptions.path === routeOptions.prefix) {
        return
      }
      let wsHandler = routeOptions.wsHandler
      let handler = routeOptions.handler

      if (routeOptions.websocket) {
        wsHandler = routeOptions.handler
        handler = function (request, reply) {
          reply.code(404).send()
        }
      }

      if (typeof wsHandler !== 'function') {
        throw new Error('invalid wsHandler function')
      }

      router.on('GET', routeOptions.path, (req, _, params) => {
        const result = wsHandler.call(fastify, req[kWs], req, params)

        if (result && typeof result.catch === 'function') {
          result.catch(err => req[kWs].destroy(err))
        }
      })

      routeOptions.handler = handler
    }
  })

  fastify.addHook('onClose', close)

  // Fastify is missing a pre-close event, or the ability to
  // add a hook before the server.close call. We need to resort
  // to monkeypatching for now.
  const oldClose = fastify.server.close
  fastify.server.close = function (cb) {
    const server = fastify.websocketServer
    for (const client of server.clients) {
      client.close()
    }
    oldClose.call(this, cb)
  }

  function handleRouting (connection, request) {
    const response = new ServerResponse(request)
    request[kWs] = WebSocket.createWebSocketStream(connection)
    request[kWs].socket = connection
    router.lookup(request, response)
  }

  next()
}

function close (fastify, done) {
  const server = fastify.websocketServer
  server.close(done)
}

module.exports = fp(fastifyWebsocket, {
  fastify: '3.x',
  name: 'fastify-websocket'
})
