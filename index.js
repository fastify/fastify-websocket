'use strict'

const fp = require('fastify-plugin')
const websocket = require('websocket-stream')

module.exports = fp(function (fastify, opts, next) {
  var handle = opts.handle

  if (typeof handle !== 'function') {
    return next(new Error('invalid handle function'))
  }

  var wss = websocket.createServer({
    server: fastify.server
  }, handle)

  fastify.decorate('websocketServer', wss)

  next()
})
