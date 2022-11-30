import wsPlugin, { WebsocketHandler, SocketStream } from '..';
import type { IncomingMessage } from "http";
import fastify, { RouteOptions, FastifyRequest, FastifyInstance, FastifyReply, RequestGenericInterface, FastifyBaseLogger, RawServerDefault, FastifySchema, RawRequestDefaultExpression, RawServerBase, ContextConfigDefault, RawReplyDefaultExpression } from 'fastify';
import { expectType } from 'tsd';
import { Server } from 'ws';
import { RouteGenericInterface } from 'fastify/types/route';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Static, Type } from '@sinclair/typebox'
import { ResolveFastifyRequestType } from 'fastify/types/type-provider';

const app: FastifyInstance = fastify();
app.register(wsPlugin);
app.register(wsPlugin, {});
app.register(wsPlugin, { options: { maxPayload: 123 } });
app.register(wsPlugin, {
  errorHandler: function errorHandler(error: Error, connection: SocketStream, request: FastifyRequest, reply: FastifyReply): void {
    expectType<FastifyInstance>(this);
    expectType<Error>(error)
    expectType<SocketStream>(connection)
    expectType<FastifyRequest>(request)
    expectType<FastifyReply>(reply)
  }
});
app.register(wsPlugin, { options: { perMessageDeflate: true } });

app.get('/websockets-via-inferrence', { websocket: true }, async function (connection, request) {
  expectType<FastifyInstance>(this);
  expectType<SocketStream>(connection);
  expectType<Server>(app.websocketServer);
  expectType<FastifyRequest<RequestGenericInterface>>(request)
  expectType<boolean>(request.ws);
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
type SchemaType = {
  params: Static<typeof schema.params>;
  querystring: Static<typeof schema.querystring>;
  body: Static<typeof schema.body>;
  headers: Static<typeof schema.headers>;
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

server.get('/websockets-type-inference',
  {
    websocket: true,
    schema
  },
  async function (connection, request) {
    expectType<FastifyInstance>(this);
    expectType<SocketStream>(connection);
    expectType<Server>(app.websocketServer);
    expectType<FastifyRequest<RequestGenericInterface, RawServerDefault, IncomingMessage, SchemaType, TypeBoxTypeProvider, unknown, FastifyBaseLogger>>(request);
    expectType<boolean>(request.ws);
    expectType<{ foo: string }>(request.params);
    expectType<{ bar: string }>(request.body);
    expectType<{ search: string }>(request.query);
    expectType<IncomingMessage['headers'] & { auth: string }>(request.headers);
  });

server.get('/not-websockets-type-inference',
  {
    websocket: false,
    schema
  },
  async (request, reply) => {
    expectType<FastifyRequest<RouteGenericInterface, RawServerDefault, IncomingMessage, SchemaType, TypeBoxTypeProvider, unknown, FastifyBaseLogger, ResolveFastifyRequestType<TypeBoxTypeProvider, FastifySchema, RouteGenericInterface>>>(request);
    expectType<FastifyReply<RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression, RouteGenericInterface, ContextConfigDefault, SchemaType, TypeBoxTypeProvider>>(reply);
    expectType<{ foo: string }>(request.params);
    expectType<{ bar: string }>(request.body);
    expectType<{ search: string }>(request.query);
    expectType<IncomingMessage['headers'] & { auth: string }>(request.headers);
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