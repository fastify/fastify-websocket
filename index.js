'use strict'

const { ServerResponse } = require('http')
const fp = require('fastify-plugin')
const WebSocket = require('ws')

const kWs = Symbol('ws')

function fastifyWebsocket (fastify, opts, next) {
  let handle = noHandle

  if (opts.handle) {
    if (typeof opts.handle !== 'function') {
      return next(new Error('invalid handle function'))
    }

    handle = opts.handle
  }

  const options = Object.assign({}, opts.options)
  if (!options.server && !options.noServer) {
    options.server = fastify.server
  }

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

      routeOptions.handler = (request, reply) => {
        if (request.raw[kWs]) {
          reply.hijack()
          const result = wsHandler.call(fastify, request.raw[kWs], request)
          if (result && typeof result.catch === 'function') {
            result.catch(err => request.raw[kWs].destroy(err))
          }
        } else {
          return handler.call(fastify, request, reply)
        }
      }
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

  function noHandle (conn, req) {
    req[kWs].socket.close()
  }

  // We monkeypatch the default route in order to
  // support the websocket global handler
  const oldDefaultRoute = fastify.defaultRoute
  fastify.defaultRoute = function (req, res) {
    if (req[kWs]) {
      const result = handle.call(fastify, req[kWs], req)
      if (result && typeof result.catch === 'function') {
        result.catch(err => req[kWs].destroy(err))
      }
    } else {
      return oldDefaultRoute(req, res)
    }
  }

  function handleRouting (connection, request) {
    const response = new ServerResponse(request)
    request[kWs] = WebSocket.createWebSocketStream(connection)
    request[kWs].socket = connection

    request[kWs].socket.on('newListener', event => {
      if (event === 'message') {
        request[kWs].resume()
      }
    })

    fastify.routing(request, response)
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
