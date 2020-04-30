import wsPlugin, { SocketStream } from '../..';
import fastify, { WebsocketHandler, FastifyRequest, FastifyInstance, RequestGenericInterface } from 'fastify';
import { expectType } from 'tsd';
import { Server as HttpServer, IncomingMessage } from 'http'
import { Server } from 'ws';

const handler: WebsocketHandler = (
  connection: SocketStream,
  req: FastifyRequest,
  params
) => {
  expectType<SocketStream>(connection);
  expectType<Server>(app.websocketServer);
  expectType<FastifyRequest<HttpServer, IncomingMessage, RequestGenericInterface>>(req)
  expectType<{ [key: string]: any } | undefined>(params);
};

const handle = (connection: SocketStream): void => {
  expectType<SocketStream>(connection)
} 

const app: FastifyInstance = fastify();
app.register(wsPlugin);
app.register(wsPlugin, {});
app.register(wsPlugin, { handle } );
app.register(wsPlugin, { options: { perMessageDeflate: true } });

app.get('/', { websocket: true }, handler);
