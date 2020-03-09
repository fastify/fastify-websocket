const wsPlugin = require('../..');
const fastify = require('fastify');
import { SocketStream } from '../..';
import { WebsocketHandler, FastifyRequest, FastifyInstance } from 'fastify';
import { expectType } from 'tsd';
import { Server } from 'ws';

const app: FastifyInstance = fastify();
app.register(wsPlugin);

const handler: WebsocketHandler = (
  connection: SocketStream,
  req: FastifyRequest,
  params
) => {
  expectType<SocketStream>(connection);
  expectType<Server>(app.websocketServer);
  expectType<{ [key: string]: any } | undefined>(params);
};

app.get('/', { websocket: true }, handler);
