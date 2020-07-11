import wsPlugin, { SocketStream } from '../..';
import fastify, { WebsocketHandler, FastifyRequest, FastifyInstance, RequestGenericInterface } from 'fastify';
import { expectType } from 'tsd';
import { Server as HttpServer, IncomingMessage } from 'http'
import { Server } from 'ws';

const app: FastifyInstance = fastify();
app.register(wsPlugin);
app.register(wsPlugin, {});
app.register(wsPlugin, {
  handle: function globalHandler(connection: SocketStream): void {
    expectType<FastifyInstance>(this);
    expectType<SocketStream>(connection)
  }
});
app.register(wsPlugin, { options: { perMessageDeflate: true } });

app.get('/', { websocket: true }, function perRouteHandler(
  connection: SocketStream,
  req: IncomingMessage,
  params
) {
  expectType<FastifyInstance>(this);
  expectType<SocketStream>(connection);
  expectType<Server>(app.websocketServer);
  expectType<IncomingMessage>(req)
  expectType<{ [key: string]: any } | undefined>(params);
});
