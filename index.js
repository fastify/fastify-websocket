'use strict'

const { ServerResponse } = require('node:http')
const { PassThrough } = require('node:stream')
const { randomBytes } = require('node:crypto')
const fp = require('fastify-plugin')
const WebSocket = require('ws')
const Duplexify = require('duplexify')

const kWs = Symbol('ws-socket')
const kWsHead = Symbol('ws-head')
const statusCodeReg = /HTTP\/1.1 (\d+)/u

function fastifyWebsocket (fastify, opts, next) {
  fastify.decorateRequest('ws', null)

  let errorHandler = defaultErrorHandler
  if (opts.errorHandler) {
    if (typeof opts.errorHandler !== 'function') {
      return next(new Error('invalid errorHandler function'))
    }

    errorHandler = opts.errorHandler
  }

  let preClose = defaultPreClose
  if (opts?.preClose) {
    if (typeof opts.preClose !== 'function') {
      return next(new Error('invalid preClose function'))
    }

    preClose = opts.preClose
  }

  if (opts.options?.noServer) {
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

  async function injectWS (path = '/', upgradeContext = {}) {
    const server2Client = new PassThrough()
    const client2Server = new PassThrough()

    const serverStream = new Duplexify(server2Client, client2Server)
    const clientStream = new Duplexify(client2Server, server2Client)

    const ws = new WebSocket(null, undefined, { isServer: false })
    const head = Buffer.from([])

    let resolve, reject
    const promise = new Promise((_resolve, _reject) => { resolve = _resolve; reject = _reject })

    ws.on('open', () => {
      clientStream.removeListener('data', onData)
      resolve(ws)
    })

    const onData = (chunk) => {
      if (chunk.toString().includes('HTTP/1.1 101 Switching Protocols')) {
        ws._isServer = false
        ws.setSocket(clientStream, head, { maxPayload: 0 })
      } else {
        clientStream.removeListener('data', onData)
        const statusCode = Number(statusCodeReg.exec(chunk.toString())[1])
        reject(new Error('Unexpected server response: ' + statusCode))
      }
    }

    clientStream.on('data', onData)

    const req = {
      ...upgradeContext,
      method: 'GET',
      headers: {
        ...upgradeContext.headers,
        connection: 'upgrade',
        upgrade: 'websocket',
        'sec-websocket-version': 13,
        'sec-websocket-key': randomBytes(16).toString('base64')
      },
      httpVersion: '1.1',
      url: path,
      [kWs]: serverStream,
      [kWsHead]: head
    }

    websocketListenServer.emit('upgrade', req, req[kWs], req[kWsHead])

    return promise
  }

  fastify.decorate('injectWS', injectWS)

  function onUpgrade (rawRequest, socket, head) {
    // Save a reference to the socket and then dispatch the request through the normal fastify router so that it will invoke hooks and then eventually a route handler that might upgrade the socket.
    rawRequest[kWs] = socket
    rawRequest[kWsHead] = head
    const rawResponse = new ServerResponse(rawRequest)
    try {
      rawResponse.assignSocket(socket)
      fastify.routing(rawRequest, rawResponse)
    } catch (err) {
      fastify.log.warn({ err }, 'websocket upgrade failed')
    }
  }
  websocketListenServer.on('upgrade', onUpgrade)

  const handleUpgrade = (rawRequest, callback) => {
    wss.handleUpgrade(rawRequest, rawRequest[kWs], rawRequest[kWsHead], (socket) => {
      wss.emit('connection', socket, rawRequest)

      socket.on('error', (error) => {
        fastify.log.error(error)
      })

      callback(socket)
    })
  }

  fastify.addHook('onRequest', (request, _reply, done) => { // this adds req.ws to the Request object
    if (request.raw[kWs]) {
      request.ws = true
    } else {
      request.ws = false
    }
    done()
  })

  fastify.addHook('onResponse', (request, _reply, done) => {
    if (request.ws) {
      request.raw[kWs].destroy()
    }
    done()
  })

  fastify.addHook('onRoute', routeOptions => {
    let isWebsocketRoute = false
    let wsHandler = routeOptions.wsHandler
    let handler = routeOptions.handler

    if (routeOptions.websocket || routeOptions.wsHandler) {
      if (routeOptions.method === 'HEAD') {
        return
      } else if (routeOptions.method !== 'GET') {
        throw new Error('websocket handler can only be declared in GET method')
      }

      isWebsocketRoute = true

      if (routeOptions.websocket) {
        wsHandler = routeOptions.handler
        handler = function (_, reply) {
          reply.code(404).send()
        }
      }

      if (typeof wsHandler !== 'function') {
        throw new TypeError('invalid wsHandler function')
      }
    }

    // we always override the route handler so we can close websocket connections to routes to handlers that don't support websocket connections
    // This is not an arrow function to fetch the encapsulated this
    routeOptions.handler = function (request, reply) {
      // within the route handler, we check if there has been a connection upgrade by looking at request.raw[kWs]. we need to dispatch the normal HTTP handler if not, and hijack to dispatch the websocket handler if so
      if (request.raw[kWs]) {
        reply.hijack()
        handleUpgrade(request.raw, socket => {
          let result
          try {
            if (isWebsocketRoute) {
              result = wsHandler.call(this, socket, request)
            } else {
              result = noHandle.call(this, socket, request)
            }
          } catch (err) {
            return errorHandler.call(this, err, socket, request, reply)
          }

          if (result && typeof result.catch === 'function') {
            result.catch(err => errorHandler.call(this, err, socket, request, reply))
          }
        })
      } else {
        return handler.call(this, request, reply)
      }
    }
  })

  // Fastify is missing a pre-close event, or the ability to
  // add a hook before the server.close call. We need to resort
  // to monkeypatching for now.
  fastify.addHook('preClose', preClose)

  function defaultPreClose (done) {
    const server = this.websocketServer
    if (server.clients) {
      for (const client of server.clients) {
        client.close()
      }
    }

    fastify.server.removeListener('upgrade', onUpgrade)

    server.close(done)

    done()
  }

  function noHandle (socket, rawRequest) {
    this.log.info({ path: rawRequest.url }, 'closed incoming websocket connection for path with no websocket handler')
    socket.close()
  }

  function defaultErrorHandler (error, socket, request) {
    request.log.error(error)
    socket.terminate()
  }

  next()
}

module.exports = fp(fastifyWebsocket, {
  fastify: '5.x',
  name: '@fastify/websocket'
})
module.exports.default = fastifyWebsocket
module.exports.fastifyWebsocket = fastifyWebsocket
