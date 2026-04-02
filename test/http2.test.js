'use strict'

const { test } = require('node:test')
const http2 = require('node:http2')
const Fastify = require('fastify')
const fastifyWebsocket = require('..')
const WebSocket = require('ws')
const { once } = require('node:events')

// Helper to create WebSocket client over HTTP/2 stream
function createWsClient (stream) {
  const head = Buffer.alloc(0)
  const ws = new WebSocket(null, undefined, {})
  // IMPORTANT: _isServer must be set explicitly before setSocket for proper frame masking
  ws._isServer = false
  stream.setNoDelay = () => {}
  return { ws, head }
}

// Helper to setup WebSocket on HTTP/2 stream and handle the immediate OPEN state
// Note: With HTTP/2, setSocket makes the WebSocket immediately OPEN without emitting 'open' event
function setupWsOnStream (ws, stream, head, onReady) {
  ws.setSocket(stream, head, { maxPayload: 104857600 })
  // WebSocket is immediately OPEN after setSocket with HTTP/2
  // Use setImmediate to allow event handlers to be attached first
  setImmediate(() => {
    if (ws.readyState === WebSocket.OPEN) {
      onReady()
    }
  })
}

test('Should expose a websocket over HTTP/2 (RFC 8441)', async (t) => {
  t.plan(2)

  const fastify = Fastify({ http2: true })
  t.after(() => fastify.close())

  await fastify.register(fastifyWebsocket)

  fastify.get('/', { websocket: true }, (socket) => {
    t.after(() => socket.terminate())

    socket.once('message', (chunk) => {
      t.assert.deepStrictEqual(chunk.toString(), 'hello server')
      socket.send('hello client')
    })
  })

  await fastify.listen({ port: 0 })
  const port = fastify.server.address().port

  // Create HTTP/2 client
  const client = http2.connect(`http://localhost:${port}`)
  t.after(() => client.close())

  // Wait for remote settings to be received
  const [settings] = await once(client, 'remoteSettings')

  // Check if the server supports extended connect protocol
  if (!settings.enableConnectProtocol) {
    t.skip('Server does not support extended connect protocol')
    return
  }

  // Send CONNECT request with :protocol websocket (RFC 8441)
  const stream = client.request({
    ':method': 'CONNECT',
    ':protocol': 'websocket',
    ':path': '/'
  })

  const { ws, head } = createWsClient(stream)

  let resolve
  const messagePromise = new Promise((r) => { resolve = r })

  ws.on('message', (data) => {
    resolve(data.toString())
  })

  ws.on('error', (err) => {
    t.fail('WebSocket error: ' + err.message)
  })

  // Wait for response
  stream.on('response', (headers) => {
    const status = headers[':status']
    if (status === 200) {
      setupWsOnStream(ws, stream, head, () => {
        ws.send('hello server')
      })
    } else {
      t.fail('Unexpected status: ' + status)
    }
  })

  const message = await messagePromise
  t.assert.deepStrictEqual(message, 'hello client')

  ws.close()
})

test('Should handle multiple HTTP/2 WebSocket connections', async (t) => {
  t.plan(4)

  const fastify = Fastify({ http2: true })
  t.after(() => fastify.close())

  await fastify.register(fastifyWebsocket)

  fastify.get('/echo', { websocket: true }, (socket) => {
    socket.on('message', (data) => {
      socket.send('echo: ' + data.toString())
    })
  })

  await fastify.listen({ port: 0 })
  const port = fastify.server.address().port

  // Create HTTP/2 client (single connection, multiple streams)
  const client = http2.connect(`http://localhost:${port}`)
  t.after(() => client.close())

  // Wait for remote settings to be received
  const [settings] = await once(client, 'remoteSettings')

  if (!settings.enableConnectProtocol) {
    t.skip('Server does not support extended connect protocol')
    return
  }

  // Helper to create WebSocket over HTTP/2
  const createWsOverHttp2 = async (path, message) => {
    const stream = client.request({
      ':method': 'CONNECT',
      ':protocol': 'websocket',
      ':path': path
    })

    const { ws, head } = createWsClient(stream)

    return new Promise((resolve, reject) => {
      ws.on('message', (data) => {
        ws.close()
        resolve(data.toString())
      })

      ws.on('error', reject)

      stream.on('response', (headers) => {
        if (headers[':status'] === 200) {
          setupWsOnStream(ws, stream, head, () => {
            ws.send(message)
          })
        } else {
          reject(new Error('Unexpected status: ' + headers[':status']))
        }
      })
    })
  }

  // Create two WebSocket connections over the same HTTP/2 connection
  const [result1, result2] = await Promise.all([
    createWsOverHttp2('/echo', 'message1'),
    createWsOverHttp2('/echo', 'message2')
  ])

  t.assert.deepStrictEqual(result1, 'echo: message1')
  t.assert.deepStrictEqual(result2, 'echo: message2')

  // Create two more to verify continued functionality
  const [result3, result4] = await Promise.all([
    createWsOverHttp2('/echo', 'message3'),
    createWsOverHttp2('/echo', 'message4')
  ])

  t.assert.deepStrictEqual(result3, 'echo: message3')
  t.assert.deepStrictEqual(result4, 'echo: message4')
})

test('Should handle regular HTTP/2 requests alongside WebSocket', async (t) => {
  t.plan(2)

  const fastify = Fastify({ http2: true })
  t.after(() => fastify.close())

  await fastify.register(fastifyWebsocket)

  // Regular HTTP route
  fastify.get('/api', (request, reply) => {
    reply.send({ message: 'hello' })
  })

  // WebSocket route
  fastify.get('/ws', { websocket: true }, (socket) => {
    socket.on('message', (data) => {
      socket.send('echo: ' + data.toString())
    })
  })

  await fastify.listen({ port: 0 })
  const port = fastify.server.address().port

  const client = http2.connect(`http://localhost:${port}`)
  t.after(() => client.close())

  // Wait for settings first
  const [settings] = await once(client, 'remoteSettings')

  // Test regular HTTP/2 request
  const httpResult = await new Promise((resolve, reject) => {
    const req = client.request({ ':path': '/api' })
    let data = ''
    req.on('data', (chunk) => { data += chunk })
    req.on('end', () => resolve(JSON.parse(data)))
    req.on('error', reject)
    req.end()
  })

  t.assert.deepStrictEqual(httpResult.message, 'hello')

  // Now test WebSocket over same connection
  if (!settings.enableConnectProtocol) {
    t.skip('Server does not support extended connect protocol')
    return
  }

  const wsResult = await new Promise((resolve, reject) => {
    const stream = client.request({
      ':method': 'CONNECT',
      ':protocol': 'websocket',
      ':path': '/ws'
    })

    const { ws, head } = createWsClient(stream)

    ws.on('message', (data) => {
      ws.close()
      resolve(data.toString())
    })

    ws.on('error', reject)

    stream.on('response', (headers) => {
      if (headers[':status'] === 200) {
        setupWsOnStream(ws, stream, head, () => {
          ws.send('test')
        })
      } else {
        reject(new Error('Unexpected status: ' + headers[':status']))
      }
    })
  })

  t.assert.deepStrictEqual(wsResult, 'echo: test')
})

test('Should track HTTP/2 WebSocket clients when clientTracking is enabled', async (t) => {
  t.plan(2)

  const fastify = Fastify({ http2: true })
  t.after(() => fastify.close())

  await fastify.register(fastifyWebsocket, {
    options: { clientTracking: true }
  })

  fastify.get('/', { websocket: true }, (socket) => {
    // Connection established
  })

  await fastify.listen({ port: 0 })
  const port = fastify.server.address().port

  const client = http2.connect(`http://localhost:${port}`)
  t.after(() => client.close())

  // Wait for remote settings to be received
  const [settings] = await once(client, 'remoteSettings')

  if (!settings.enableConnectProtocol) {
    t.skip('Server does not support extended connect protocol')
    return
  }

  const stream = client.request({
    ':method': 'CONNECT',
    ':protocol': 'websocket',
    ':path': '/'
  })

  const { ws, head } = createWsClient(stream)

  const openPromise = new Promise((resolve) => {
    stream.on('response', (headers) => {
      if (headers[':status'] === 200) {
        setupWsOnStream(ws, stream, head, () => {
          resolve()
        })
      }
    })
  })

  await openPromise

  // Check that the client is tracked
  t.assert.deepStrictEqual(fastify.websocketServer.clients.size, 1)

  // Close the websocket
  ws.close()

  // Wait a bit for the close to propagate
  await new Promise((resolve) => setTimeout(resolve, 100))

  // Client should be removed from tracking
  t.assert.deepStrictEqual(fastify.websocketServer.clients.size, 0)
})
