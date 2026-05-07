import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import { Type } from 'typebox'
import fastify, { FastifyBaseLogger, FastifyInstance, FastifyReply, FastifyRequest, FastifySchema, RawRequestDefaultExpression, RawServerDefault, RequestGenericInterface, RouteOptions } from 'fastify'
import { RouteGenericInterface } from 'fastify/types/route'
import type { IncomingMessage } from 'node:http'
import { expect } from 'tstyche'
import { Server } from 'ws'
import fastifyWebsocket, { fastifyWebsocket as namedFastifyWebsocket, WebSocket, WebsocketHandler } from '.'

const app: FastifyInstance = fastify()
app.register(fastifyWebsocket)
app.register(fastifyWebsocket, {})
app.register(fastifyWebsocket, { options: { maxPayload: 123 } })
app.register(fastifyWebsocket, {
  errorHandler: function errorHandler (error: Error, socket: WebSocket, request: FastifyRequest, reply: FastifyReply): void {
    expect(this).type.toBe<FastifyInstance>()
    expect(error).type.toBe<Error>()
    expect(socket).type.toBe<WebSocket>()
    expect(request).type.toBe<FastifyRequest>()
    expect(reply).type.toBe<FastifyReply>()
  }
})
app.register(fastifyWebsocket, { options: { perMessageDeflate: true } })
app.register(fastifyWebsocket, { preClose: function syncPreclose () { } })
app.register(fastifyWebsocket, { preClose: async function asyncPreclose () { } })

app.get('/websockets-via-inferrence', { websocket: true }, async function (socket, request) {
  expect(this).type.toBe<FastifyInstance>()
  expect(socket).type.toBe<WebSocket>()
  expect(app.websocketServer).type.toBe<Server>()
  expect(request).type.toBe<FastifyRequest<RequestGenericInterface>>()
  expect(request.ws).type.toBe<boolean>()
  expect(request.log).type.toBe<FastifyBaseLogger>()
})

const handler: WebsocketHandler = async (socket, request) => {
  expect(socket).type.toBe<WebSocket>()
  expect(app.websocketServer).type.toBe<Server>()
  expect(request).type.toBe<FastifyRequest<RequestGenericInterface>>()
}

app.get('/websockets-via-annotated-const', { websocket: true }, handler)

app.get('/not-specifed', async (request, reply) => {
  expect(request).type.toBe<FastifyRequest>()
  expect(reply).type.toBe<FastifyReply>()
  expect(request.ws).type.toBe<boolean>()
})

app.get('/not-websockets', { websocket: false }, async (request, reply) => {
  expect(request).type.toBe<FastifyRequest>()
  expect(reply).type.toBe<FastifyReply>()
})

app.route({
  method: 'GET',
  url: '/route-full-declaration-syntax',
  handler: (request, reply) => {
    expect(request).type.toBe<FastifyRequest>()
    expect(reply).type.toBe<FastifyReply>()
    expect(request.ws).type.toBe<boolean>()
  },
  wsHandler: (socket, request) => {
    expect(socket).type.toBe<WebSocket>()
    expect(request).type.toBe<FastifyRequest<RouteGenericInterface>>()
    expect(request.ws).type.toBe<boolean>()
  },
})

const augmentedRouteOptions: RouteOptions = {
  method: 'GET',
  url: '/route-with-exported-augmented-route-options',
  handler: (request, reply) => {
    expect(request).type.toBe<FastifyRequest>()
    expect(reply).type.toBe<FastifyReply>()
  },
  wsHandler: (socket, request) => {
    expect(socket).type.toBe<WebSocket>()
    expect(request).type.toBe<FastifyRequest<RouteGenericInterface>>()
  },
}
app.route(augmentedRouteOptions)

app.get<{
  Params: { foo: string };
  Body: { bar: string };
  Querystring: { search: string };
  Headers: { auth: string };
}>(
  '/shorthand-explicit-types',
  {
    websocket: true
  },
  async (socket, request) => {
    expect(socket).type.toBe<WebSocket>()
    expect(request.params).type.toBe<{ foo: string }>()
    expect(request.body).type.toBe<{ bar: string }>()
    expect(request.query).type.toBe<{ search: string }>()
    expect(request.headers).type.toBe<
      IncomingMessage['headers'] & { auth: string }
    >()
  }
)

app.route<{
  Params: { foo: string };
  Body: { bar: string };
  Querystring: { search: string };
  Headers: { auth: string };
}>({
  method: 'GET',
  url: '/longhand-explicit-types',
  handler: (request, _reply) => {
    expect(request.params).type.toBe<{ foo: string }>()
    expect(request.body).type.toBe<{ bar: string }>()
    expect(request.query).type.toBe<{ search: string }>()
    expect(request.headers).type.toBe<
      IncomingMessage['headers'] & { auth: string }
    >()
  },
  wsHandler: (socket, request) => {
    expect(socket).type.toBe<WebSocket>()
    expect(request.params).type.toBe<{ foo: string }>()
    expect(request.body).type.toBe<{ bar: string }>()
    expect(request.query).type.toBe<{ search: string }>()
    expect(request.headers).type.toBe<
      IncomingMessage['headers'] & { auth: string }
    >()
  }
})

const schema = {
  params: Type.Object({ foo: Type.String() }, { required: ['foo'] }),
  querystring: Type.Object({ search: Type.String() }, { required: ['search'] }),
  body: Type.Object({ bar: Type.String() }, { required: ['bar'] }),
  headers: Type.Object({ auth: Type.String() }, { required: ['auth'] })
} satisfies FastifySchema

const server = app.withTypeProvider<TypeBoxTypeProvider>()

server.route({
  method: 'GET',
  url: '/longhand-type-inference',
  schema,
  handler: (request, _reply) => {
    expect(request.params).type.toBe<{ foo: string }>()
    expect(request.body).type.toBe<{ bar: string }>()
    expect(request.query).type.toBe<{ search: string }>()
    expect(request.headers).type.toBe<
      IncomingMessage['headers'] & { auth: string }
    >()
  },
  wsHandler: (socket, request) => {
    expect(socket).type.toBe<WebSocket>()
    expect(request.params).type.toBe<{ foo: string }>()
    expect(request.body).type.toBe<{ bar: string }>()
    expect(request.query).type.toBe<{ search: string }>()
    expect(request.headers).type.toBe<
      IncomingMessage['headers'] & { auth: string }
    >()
  }
})

server.get(
  '/websockets-no-type-inference',
  { websocket: true },
  async function (socket, request) {
    expect(this).type.toBe<FastifyInstance>()
    expect(socket).type.toBe<WebSocket>()
    expect(app.websocketServer).type.toBe<Server>()
    expect(request).type.toBe<
      FastifyRequest<
        RequestGenericInterface,
        RawServerDefault,
        RawRequestDefaultExpression,
        FastifySchema,
        TypeBoxTypeProvider,
        unknown,
        FastifyBaseLogger
      >
    >()
    expect(request.ws).type.toBe<boolean>()
    expect(request.params).type.toBe<unknown>()
    expect(request.body).type.toBe<unknown>()
    expect(request.query).type.toBe<unknown>()
    expect(request.headers).type.toBe<IncomingMessage['headers']>()
  }
)

expect(namedFastifyWebsocket).type.toBe(fastifyWebsocket)
expect(fastifyWebsocket).type.toBe(fastifyWebsocket)

app.injectWS('/', {}, {})
app.injectWS('/', {}, {
  onInit (ws) {
    expect(ws).type.toBe<WebSocket>()
  },
})
app.injectWS('/', {}, {
  onOpen (ws) {
    expect(ws).type.toBe<WebSocket>()
  },
})
