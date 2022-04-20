'use strict'

const { ServerResponse } = require('http')
const fp = require('fastify-plugin')
const WebSocket = require('ws')

const kWs = Symbol('ws-socket')
const kWsHead = Symbol('ws-head')
const kWebSocketSchema = Symbol('websocket-body-schema')

function fastifyWebsocket (fastify, opts, next) {
  fastify.decorateRequest('ws', null)

  let errorHandler = defaultErrorHandler
  if (opts.errorHandler) {
    if (typeof opts.errorHandler !== 'function') {
      return next(new Error('invalid errorHandler function'))
    }

    errorHandler = opts.errorHandler
  }

  if (opts.options && opts.options.noServer) {
    return next(new Error("fastify-websocket doesn't support the ws noServer option. If you want to create a websocket server detatched from fastify, use the ws library directly."))
  }

  const wssOptions = Object.assign({ noServer: true }, opts.options)

  if (wssOptions.path) {
    fastify.log.warn('ws server path option shouldn\'t be provided, use a route instead')
  }

  // We always handle upgrading ourselves in this library so that we can dispatch through the fastify stack before actually upgrading
  // For this reason, we run the WebSocket.Server in noServer mode, and prevent the user from passing in a http.Server instance for it to attach to.
  // Usually, we listen to the upgrade event of the `fastify.server`, but we do still support this server option by just listening to upgrades on it if passed.
  const websocketListenServer = wssOptions.server || fastify.server
  delete wssOptions.server

  const wss = new WebSocket.Server(wssOptions)
  fastify.decorate('websocketServer', wss)

  websocketListenServer.on('upgrade', (rawRequest, socket, head) => {
    // Save a reference to the socket and then dispatch the request through the normal fastify router so that it will invoke hooks and then eventually a route handler that might upgrade the socket.
    rawRequest[kWs] = socket
    rawRequest[kWsHead] = head

    if (closing) {
      handleUpgrade(rawRequest, null, (connection) => {
        connection.socket.close(1001)
      })
    } else {
      const rawResponse = new ServerResponse(rawRequest)
      rawResponse.assignSocket(socket)
      fastify.routing(rawRequest, rawResponse)
    }
  })

  const handleUpgrade = (rawRequest, request, callback) => {
    wss.handleUpgrade(rawRequest, rawRequest[kWs], rawRequest[kWsHead], (socket) => {
      wss.emit('connection', socket, rawRequest)
      const connection = WebSocket.createWebSocketStream(socket, opts.connectionOptions)
      socket.afterDuplex = true
      socket.validator = request.context[kWebSocketSchema]
      socket.strict = opts.strictMode ? opts.strictMode : false
      connection.socket = socket

      connection.socket.on('newListener', event => {
        if (event === 'message') {
          connection.resume()
        }
      })

      callback(connection)
    })
  }

  fastify.addHook('onRequest', (request, reply, done) => { // this adds req.ws to the Request object
    if (request.raw[kWs]) {
      request.ws = true
    } else {
      request.ws = false
    }
    done()
  })

  fastify.addHook('onError', (request, reply, error, done) => {
    if (request.raw[kWs]) {
      // Hijack reply to prevent fastify from sending the error after onError hooks are done running
      reply.hijack()
      handleUpgrade(request.raw, request, connection => {
        // Handle the error
        errorHandler.call(this, error, connection, request, reply)
      })
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

    // we always override the route handler so we can close websocket connections to routes to handlers that don't support websocket connections
    // This is not an arrow function to fetch the encapsulated this
    routeOptions.handler = function (request, reply) {
      request.context[kWebSocketSchema] = request.context.schema ? fastify.validatorCompiler({ schema: request.context.schema.body }) : null

      // within the route handler, we check if there has been a connection upgrade by looking at request.raw[kWs]. we need to dispatch the normal HTTP handler if not, and hijack to dispatch the websocket handler if so
      if (request.raw[kWs]) {
        reply.hijack()
        handleUpgrade(request.raw, request, connection => {
          let result
          try {
            if (isWebsocketRoute) {
              result = wsHandler.call(this, connection, request)
            } else {
              result = noHandle.call(this, connection, request)
            }
          } catch (err) {
            return errorHandler.call(this, err, connection, request, reply)
          }

          if (result && typeof result.catch === 'function') {
            result.catch(err => errorHandler.call(this, err, connection, request, reply))
          }
        })
      } else {
        return handler.call(this, request, reply)
      }
    }
  })

  fastify.addHook('onClose', close)

  let closing = false

  // Fastify is missing a pre-close event, or the ability to
  // add a hook before the server.close call. We need to resort
  // to monkeypatching for now.
  const oldClose = fastify.server.close
  fastify.server.close = function (cb) {
    closing = true

    // Call oldClose first so that we stop listening. This ensures the
    // server.clients list will be up to date when we start closing below.
    oldClose.call(this, cb)

    const server = fastify.websocketServer
    if (!server.clients) return
    for (const client of server.clients) {
      client.close()
    }
  }

  function noHandle (connection, rawRequest) {
    this.log.info({ path: rawRequest.url }, 'closed incoming websocket connection for path with no websocket handler')
    connection.socket.close()
  }

  function defaultErrorHandler (error, conn, request, reply) {
    // Before destroying the connection, we attach an error listener.
    // Since we already handled the error, adding this listener prevents the ws
    // library from emitting the error and causing an uncaughtException
    // Reference: https://github.com/websockets/ws/blob/master/lib/stream.js#L35
    conn.on('error', _ => { })
    request.log.error(error)
    conn.destroy(error)
  }

  const oldDefaultRoute = fastify.getDefaultRoute()
  fastify.setDefaultRoute(function (req, res) {
    if (req[kWs]) {
      handleUpgrade(req, (connection) => {
        noHandle.call(fastify, connection, req)
      })
    } else {
      return oldDefaultRoute(req, res)
    }
  })

  next()
}

function close (fastify, done) {
  const server = fastify.websocketServer
  server.close(done)
}

class ValidateWebSocket extends WebSocket {
  constructor (...args) {
    super(...args)
    this.afterDuplex = false
    this.validator = null
    this.strict = false
  }

  wrapValidation (handler) {
    return (message, isBinary) => {
      if (isBinary) return handler(message, isBinary)
      try {
        const parsedInput = JSON.parse(message.toString())
        if (this.validator(parsedInput)) return handler(parsedInput, false)
        if (this.strict) {
          return this.close(1003, 'Unsupported payload')
        }
        return this.send(JSON.stringify(this.validator.errors))
      } catch (e) {
        if (this.strict) {
          return this.close(1003, 'Unsupported payload')
        } else {
          return this.send('Unsupported payload')
        }
      }
    }
  }

  on (event, handler, options) {
    if (!this.afterDuplex) return super.on(event, handler)
    if (event === 'message') {
      super.on(event, this.wrapValidation(handler), options)
    } else {
      super.on(event, handler, options)
    }
  }
}

module.exports = fp(fastifyWebsocket, {
  fastify: '>= 3.11.0',
  name: 'fastify-websocket'
})
module.exports.ValidateWebSocket = ValidateWebSocket
