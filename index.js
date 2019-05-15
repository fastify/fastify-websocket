'use strict'

const { ServerResponse } = require('http')
const fp = require('fastify-plugin')
const websocket = require('websocket-stream')
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

  const wss = websocket.createServer(options, handleRouting)

  fastify.decorate('websocketServer', wss)

  fastify.addHook('onRoute', routeOptions => {
    if (routeOptions.websocket || routeOptions.wsHandler) {
      if (routeOptions.method !== 'GET') {
        throw Error('web socket handler could be declared only in GET method')
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

      router.on('GET', routeOptions.path, (req, _) => wsHandler(req[kWs], req))

      routeOptions.handler = handler
    }
  })

  fastify.addHook('onClose', close)

  function handleRouting (connection, request) {
    const response = new ServerResponse(request)
    request[kWs] = connection
    router.lookup(request, response)
  }

  next()
}

function close (fastify, done) {
  fastify.websocketServer.close(done)
}

module.exports = fp(fastifyWebsocket, {
  fastify: '>=0.39.0',
  name: 'fastify-websocket'
})
