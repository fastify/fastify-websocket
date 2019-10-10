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
    ? (req, res) => opts.handle(req[kWs], req)
    : (req, res) => { req[kWs].socket.close() }

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
        const result = wsHandler(req[kWs], req, params)

        if (result && typeof result.catch === 'function') {
          result.catch((err) => req[kWs].destroy(err))
        }
      })

      routeOptions.handler = handler
    }
  })

  fastify.addHook('onClose', close)

  function handleRouting (connection, request) {
    const response = new ServerResponse(request)
    request[kWs] = WebSocket.createWebSocketStream(connection)
    request[kWs].socket = connection
    router.lookup(request, response)
  }

  next()
}

function close (fastify, done) {
  fastify.websocketServer.close(done)
}

module.exports = fp(fastifyWebsocket, {
  fastify: '>=2.4.1',
  name: 'fastify-websocket'
})
