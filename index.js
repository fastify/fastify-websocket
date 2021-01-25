'use strict'

const { ServerResponse } = require('http')
const fp = require('fastify-plugin')
const WebSocket = require('ws')

const kWs = Symbol('ws')

function fastifyWebsocket (fastify, opts, next) {
  let errorHandler = defaultErrorHandler
  if (opts.errorHandler) {
    if (typeof opts.errorHandler !== 'function') {
      return next(new Error('invalid errorHandler function'))
    }

    errorHandler = opts.errorHandler
  }

  const options = Object.assign({}, opts.options)
  if (options.path) {
    fastify.log.warn('ws server path option shouldn\'t be provided, use a route instead')
  }
  if (!options.server && !options.noServer) {
    options.server = fastify.server
  }

  const wss = new WebSocket.Server(options)
  wss.on('connection', handleRouting)

  fastify.decorate('websocketServer', wss)

  fastify.addHook('onError', (request, reply, error, done) => {
    if (request.raw[kWs]) {
      // Hijack reply to prevent fastify from sending the error after onError hooks are done running
      reply.hijack()
      // Handle the error
      errorHandler.call(this, error, request.raw[kWs], request, reply)
    }
    done()
  })

  fastify.addHook('onRoute', routeOptions => {
    let isWebsocketRoute = false
    let wsHandler = routeOptions.wsHandler
    let handler = routeOptions.handler

    if (routeOptions.websocket || routeOptions.wsHandler) {
      if (routeOptions.method !== 'GET') {
        throw new Error('websocket handler can only be declared in GET method')
      }

      isWebsocketRoute = true

      if (routeOptions.websocket) {
        wsHandler = routeOptions.handler
        handler = function (request, reply) {
          reply.code(404).send()
        }
      }

      if (typeof wsHandler !== 'function') {
        throw new Error('invalid wsHandler function')
      }
    }

    routeOptions.handler = (request, reply) => {
      if (request.raw[kWs]) {
        reply.hijack()
        let result
        if (isWebsocketRoute) {
          result = wsHandler.call(fastify, request.raw[kWs], request)
        } else {
          result = noHandle.call(fastify, request.raw[kWs], request.raw)
        }
        if (result && typeof result.catch === 'function') {
          result.catch(err => errorHandler.call(this, err, request.raw[kWs], request, reply))
        }
      } else {
        return handler.call(fastify, request, reply)
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
    this.log.info({ path: req.url }, 'closed incoming websocket connection')
    req[kWs].socket.close()
  }

  function defaultErrorHandler (error, conn, request, reply) {
    // Before destroying the connection, we attach an error listener.
    // Since we already handled the error, adding this listener prevents the ws
    // library from emitting the error and causing an uncaughtException
    // Reference: https://github.com/websockets/ws/blob/master/lib/stream.js#L35
    conn.on('error', _ => {})
    request.log.error(error)
    conn.destroy(error)
  }

  const oldDefaultRoute = fastify.getDefaultRoute()
  fastify.setDefaultRoute(function (req, res) {
    if (req[kWs]) {
      noHandle.call(fastify, req[kWs], req)
    } else {
      return oldDefaultRoute(req, res)
    }
  })

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
  fastify: '>= 3.11.0',
  name: 'fastify-websocket'
})
