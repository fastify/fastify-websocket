import wsPlugin, { WebsocketHandler, SocketStream } from '../..';
import fastify, { RouteOptions, FastifyRequest, FastifyInstance, FastifyReply } from 'fastify';
import { expectType } from 'tsd';
import { Server } from 'ws';

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

app.get('/websockets-via-inferrence', { websocket: true }, async function(connection, request) {
  expectType<FastifyInstance>(this);
  expectType<SocketStream>(connection);
  expectType<Server>(app.websocketServer);
  expectType<FastifyRequest>(request)
});

const handler: WebsocketHandler = async (connection, request) => {
  expectType<SocketStream>(connection);
  expectType<Server>(app.websocketServer);
  expectType<FastifyRequest>(request)
}

app.get('/websockets-via-annotated-const', { websocket: true }, handler);

app.get('/not-specifed', async (request, reply) => {
  expectType<FastifyRequest>(request);
  expectType<FastifyReply>(reply)
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
  },
  wsHandler: (connection, request) => {
    expectType<SocketStream>(connection);
    expectType<FastifyRequest>(request);
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
    expectType<FastifyRequest>(request)
  },
};
app.route(augmentedRouteOptions);
