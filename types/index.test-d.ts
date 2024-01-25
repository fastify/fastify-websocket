import fastifyWebsocket, { WebsocketHandler, SocketStream, fastifyWebsocket as namedFastifyWebsocket, default as defaultFastifyWebsocket } from '..';
import type { IncomingMessage } from "http";
import fastify, { RouteOptions, FastifyRequest, FastifyInstance, FastifyReply, RequestGenericInterface, FastifyBaseLogger, RawServerDefault, FastifySchema, RawRequestDefaultExpression } from 'fastify';
import { expectType } from 'tsd';
import { Server } from 'ws';
import { RouteGenericInterface } from 'fastify/types/route';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox'

const app: FastifyInstance = fastify();
app.register(fastifyWebsocket);
app.register(fastifyWebsocket, {});
app.register(fastifyWebsocket, { options: { maxPayload: 123 } });
app.register(fastifyWebsocket, {
  errorHandler: function errorHandler(error: Error, connection: SocketStream, request: FastifyRequest, reply: FastifyReply): void {
    expectType<FastifyInstance>(this);
    expectType<Error>(error)
    expectType<SocketStream>(connection)
    expectType<FastifyRequest>(request)
    expectType<FastifyReply>(reply)
  }
});
app.register(fastifyWebsocket, { options: { perMessageDeflate: true } });
app.register(fastifyWebsocket, { preClose: function syncPreclose() {} });
app.register(fastifyWebsocket, { preClose: async function asyncPreclose(){} });

app.get('/websockets-via-inferrence', { websocket: true }, async function (connection, request) {
  expectType<FastifyInstance>(this);
  expectType<SocketStream>(connection);
  expectType<Server>(app.websocketServer);
  expectType<FastifyRequest<RequestGenericInterface>>(request)
  expectType<boolean>(request.ws);
  expectType<FastifyBaseLogger>(request.log);
});

const handler: WebsocketHandler = async (connection, request) => {
  expectType<SocketStream>(connection);
  expectType<Server>(app.websocketServer);
  expectType<FastifyRequest<RequestGenericInterface>>(request)
}

app.get('/websockets-via-annotated-const', { websocket: true }, handler);

app.get('/not-specifed', async (request, reply) => {
  expectType<FastifyRequest>(request);
  expectType<FastifyReply>(reply)
  expectType<boolean>(request.ws);
});

app.get('/not-websockets', { websocket: false }, async (request, reply) => {
  expectType<FastifyRequest>(request);
  expectType<FastifyReply>(reply);
});

app.route({
  method: 'GET',
  url: '/route-full-declaration-syntax',
  handler: (request, reply) => {
    expectType<FastifyRequest>(request);
    expectType<FastifyReply>(reply);
    expectType<boolean>(request.ws);
  },
  wsHandler: (connection, request) => {
    expectType<SocketStream>(connection);
    expectType<FastifyRequest<RouteGenericInterface>>(request);
    expectType<boolean>(request.ws);
  },
});

const augmentedRouteOptions: RouteOptions = {
  method: 'GET',
  url: '/route-with-exported-augmented-route-options',
  handler: (request, reply) => {
    expectType<FastifyRequest>(request);
    expectType<FastifyReply>(reply);
  },
  wsHandler: (connection, request) => {
    expectType<SocketStream>(connection);
    expectType<FastifyRequest<RouteGenericInterface>>(request)
  },
};
app.route(augmentedRouteOptions);


app.get<{ Params: { foo: string }, Body: { bar: string }, Querystring: { search: string }, Headers: { auth: string } }>('/shorthand-explicit-types', {
  websocket: true
}, async (connection, request) => {
  expectType<SocketStream>(connection);
  expectType<{ foo: string }>(request.params);
  expectType<{ bar: string }>(request.body);
  expectType<{ search: string }>(request.query);
  expectType< IncomingMessage['headers'] & { auth: string }>(request.headers);
});


app.route<{ Params: { foo: string }, Body: { bar: string }, Querystring: { search: string }, Headers: { auth: string } }>({
  method: 'GET',
  url: '/longhand-explicit-types',
  handler: (request, _reply) => {
    expectType<{ foo: string }>(request.params);
    expectType<{ bar: string }>(request.body);
    expectType<{ search: string }>(request.query);
    expectType<IncomingMessage['headers'] & {  auth: string }>(request.headers);
  },
  wsHandler: (connection, request) => {
    expectType<SocketStream>(connection);
    expectType<{ foo: string }>(request.params);
    expectType<{ bar: string }>(request.body);
    expectType<{ search: string }>(request.query);
    expectType<IncomingMessage['headers'] & { auth: string }>(request.headers);
  },
});


const schema = {
  params: Type.Object({
    foo: Type.String()
  }),
  querystring: Type.Object({
    search: Type.String()
  }),
  body: Type.Object({
    bar: Type.String()
  }),
  headers: Type.Object({
    auth: Type.String()
  })
};

const server = app.withTypeProvider<TypeBoxTypeProvider>();

server.route({
  method: 'GET',
  url: '/longhand-type-inference',
  schema,
  handler: (request, _reply) => {
    expectType<{ foo: string }>(request.params);
    expectType<{ bar: string }>(request.body);
    expectType<{ search: string }>(request.query);
    expectType<IncomingMessage['headers'] & { auth: string }>(request.headers);
  },
  wsHandler: (connection, request) => {
    expectType<SocketStream>(connection);
    expectType<{ foo: string }>(request.params);
    expectType<{ bar: string }>(request.body);
    expectType<{ search: string }>(request.query);
    expectType<IncomingMessage['headers'] & { auth: string }>(request.headers);
  },
});

server.get('/websockets-no-type-inference',
  { websocket: true },
  async function (connection, request) {
    expectType<FastifyInstance>(this);
    expectType<SocketStream>(connection);
    expectType<Server>(app.websocketServer);
    expectType<FastifyRequest<RequestGenericInterface, RawServerDefault, RawRequestDefaultExpression, FastifySchema, TypeBoxTypeProvider, unknown, FastifyBaseLogger>>(request);
    expectType<boolean>(request.ws);
    expectType<unknown>(request.params);
    expectType<unknown>(request.body);
    expectType<unknown>(request.query);
    expectType<IncomingMessage['headers']>(request.headers);
  });

  expectType<typeof fastifyWebsocket>(namedFastifyWebsocket);
  expectType<typeof fastifyWebsocket>(defaultFastifyWebsocket);
  
