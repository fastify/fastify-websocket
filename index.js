'use strict'

const fp = require('fastify-plugin')
const websocket = require('websocket-stream')

function fastifyWebsocket (fastify, opts, next) {
  const handle = opts.handle
  const options = Object.assign({ server: fastify.server }, opts.options)

  if (typeof handle !== 'function') {
    return next(new Error('invalid handle function'))
  }

  const wss = websocket.createServer(options, handle)

  fastify.decorate('websocketServer', wss)

  fastify.addHook('onClose', close)

  next()
}

function close (fastify, done) {
  fastify.websocketServer.close(done)
}

module.exports = fp(fastifyWebsocket, {
  fastify: '>=0.39.0',
  name: 'fastify-websocket'
})
