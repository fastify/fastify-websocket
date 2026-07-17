'use strict'

const { ServerResponse } = require('node:http')
const { PassThrough } = require('node:stream')
const { randomBytes } = require('node:crypto')
const fp = require('fastify-plugin')
const WebSocket = require('ws')
const Duplexify = require('duplexify')

const kWs = Symbol('ws-socket')
const kWsHead = Symbol('ws-head')
const kWsHttp2 = Symbol('ws-http2')
const kWsHttp2Handled = Symbol('ws-http2-handled')
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

  // Check if this is an HTTP/2 server by checking for http2 module's server types
  const isHttp2Server = websocketListenServer.constructor.name === 'Http2Server' ||
    websocketListenServer.constructor.name === 'Http2SecureServer'

  // For HTTP/2 servers, enable the extended CONNECT protocol (RFC 8441)
  // This allows WebSocket connections over HTTP/2
  if (isHttp2Server && typeof websocketListenServer.updateSettings === 'function') {
    websocketListenServer.updateSettings({ enableConnectProtocol: true })
  }

  // TODO: place upgrade context as options
  async function injectWS (path = '/', upgradeContext = {}, options = {}) {
    const server2Client = new PassThrough()
    const client2Server = new PassThrough()

    const serverStream = new Duplexify(server2Client, client2Server)
    const clientStream = new Duplexify(client2Server, server2Client)

    const ws = new WebSocket(null, undefined, { isServer: false })
    const head = Buffer.from([])

    let resolve, reject
    const promise = new Promise((_resolve, _reject) => { resolve = _resolve; reject = _reject })

    typeof options.onInit === 'function' && options.onInit(ws)

    ws.on('open', () => {
      typeof options.onOpen === 'function' && options.onOpen(ws)
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

  // HTTP/2 WebSocket handler (RFC 8441 - Extended CONNECT Protocol)
  // For HTTP/2, WebSocket connections use CONNECT method with :protocol pseudo-header
  function onHttp2Stream (stream, headers) {
    // Mark this stream as handled by websocket plugin
    // This prevents Fastify's HTTP/2 compatibility layer from processing it
    stream[kWsHttp2Handled] = true

    // Get the path from :path pseudo-header
    /* c8 ignore next */
    const path = headers[':path'] || '/'

    // Create a minimal request object that mimics an HTTP/1.1 request for routing
    // The HTTP/2 stream will be stored in kWs and used as the WebSocket transport
    const rawRequest = {
      method: 'GET', // WebSocket routes are registered as GET
      url: path,
      headers: {
        ...headers,
        // Add headers that WebSocket routes might check
        connection: 'upgrade',
        upgrade: 'websocket'
      },
      httpVersion: '2.0',
      socket: stream.session.socket,
      [kWs]: stream,
      [kWsHead]: Buffer.alloc(0),
      [kWsHttp2]: true
    }

    // Create a mock response object for Fastify routing
    // We use a PassThrough stream as a sink instead of the real HTTP/2 stream
    // This prevents ServerResponse from interfering with the HTTP/2 stream
    // The actual response (status 200) is sent in handleHttp2WebSocket
    const mockSocket = new PassThrough()
    mockSocket.remoteAddress = stream.session?.socket?.remoteAddress
    const rawResponse = new ServerResponse(rawRequest)
    rawResponse.assignSocket(mockSocket)

    try {
      fastify.routing(rawRequest, rawResponse)
      /* c8 ignore next 4 */
    } catch (err) {
      fastify.log.warn({ err }, 'http2 websocket connection failed')
      stream.close()
    }
  }

  function onUpgrade (rawRequest, socket, head) {
    // Save a reference to the socket and then dispatch the request through the normal fastify router so that it will invoke hooks and then eventually a route handler that might upgrade the socket.
    rawRequest[kWs] = socket
    rawRequest[kWsHead] = head
    const rawResponse = new ServerResponse(rawRequest)
    try {
      rawResponse.assignSocket(socket)
      fastify.routing(rawRequest, rawResponse)
      /* c8 ignore next 3 */
    } catch (err) {
      fastify.log.warn({ err }, 'websocket upgrade failed')
    }
  }

  // For HTTP/1.1 servers, listen to upgrade event
  // For HTTP/2 servers, we need to intercept the stream event and prevent Fastify's
  // internal handler from processing WebSocket CONNECT requests
  if (isHttp2Server) {
    // Get Fastify's original stream handler
    const listeners = websocketListenServer.listeners('stream')
    const fastifyHandler = listeners.find(l => l.name === 'bound onServerStream')

    if (fastifyHandler) {
      // Remove Fastify's handler
      websocketListenServer.removeListener('stream', fastifyHandler)

      // Add a wrapper that handles WebSocket CONNECT or delegates to Fastify
      websocketListenServer.on('stream', function onStreamWrapper (stream, headers) {
        // Check if this is a WebSocket CONNECT request
        if (headers[':method'] === 'CONNECT' && headers[':protocol'] === 'websocket') {
          // Handle as WebSocket - don't let Fastify process this stream
          onHttp2Stream(stream, headers)
        } else {
          // Let Fastify handle regular HTTP/2 requests
          fastifyHandler(stream, headers)
        }
      })
      /* c8 ignore next 4 */
    } else {
      // Fallback: if we can't find Fastify's handler, just prepend ours
      websocketListenServer.prependListener('stream', onHttp2Stream)
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

  // Handle HTTP/2 WebSocket connections (RFC 8441)
  // For HTTP/2, we respond with status 200 and then create WebSocket over the stream
  const handleHttp2WebSocket = (rawRequest, callback) => {
    const stream = rawRequest[kWs]
    const head = rawRequest[kWsHead]

    // Respond to the CONNECT request - this establishes the WebSocket tunnel
    // For HTTP/2, we respond with status 200 (not 101 like HTTP/1.1)
    stream.respond({ ':status': 200 })

    // Create a WebSocket instance and set the stream as its socket
    const socket = new WebSocket(null, undefined, {})

    // IMPORTANT: _isServer must be set explicitly before setSocket
    // This ensures proper WebSocket frame masking (server expects masked frames from clients)
    socket._isServer = true

    // HTTP/2 streams don't have setNoDelay, so we add a no-op
    if (!stream.setNoDelay) {
      stream.setNoDelay = () => {}
    }

    // Set the socket using the HTTP/2 stream as the transport
    // maxPayload from wssOptions or use a large default
    const maxPayload = wssOptions.maxPayload || 104857600 // 100MB default
    socket.setSocket(stream, head, { maxPayload })

    // Track the client in the WebSocket server if client tracking is enabled
    if (wss.options.clientTracking) {
      wss.clients.add(socket)
      socket.on('close', () => {
        wss.clients.delete(socket)
      })
    }

    wss.emit('connection', socket, rawRequest)

    /* c8 ignore next 3 */
    socket.on('error', (error) => {
      fastify.log.error(error)
    })

    callback(socket)
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
      const stream = request.raw[kWs]
      // For HTTP/2 streams, use close() if destroy() is not available
      if (typeof stream.destroy === 'function') {
        stream.destroy()
        /* c8 ignore next 3 */
      } else if (typeof stream.close === 'function') {
        stream.close()
      }
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
        if (!routeOptions.schema) {
          routeOptions.schema = {}
        }
        routeOptions.schema.hide = true

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

        // Use appropriate handler based on HTTP version
        // HTTP/2 WebSocket (RFC 8441) uses handleHttp2WebSocket
        // HTTP/1.1 WebSocket uses handleUpgrade
        const upgradeHandler = request.raw[kWsHttp2] ? handleHttp2WebSocket : handleUpgrade

        upgradeHandler(request.raw, socket => {
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

  fastify.addHook('preClose', preClose)

  function defaultPreClose (done) {
    const server = this.websocketServer
    if (server.clients) {
      for (const client of server.clients) {
        client.close()
      }
    }

    fastify.server.removeListener('upgrade', onUpgrade)
    if (isHttp2Server) {
      // Remove our stream wrapper/handler
      const listeners = fastify.server.listeners('stream')
      /* c8 ignore next */
      const ourHandler = listeners.find(l => l.name === 'onStreamWrapper' || l.name === 'onHttp2Stream')
      if (ourHandler) {
        fastify.server.removeListener('stream', ourHandler)
      }
    }

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
