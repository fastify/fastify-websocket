const wsPlugin = require('../..');
const fastify = require('fastify');
import { IncomingMessage } from "http";
import { SocketStream } from '../..';
import { WebsocketHandler, FastifyInstance } from 'fastify';
import { expectType } from 'tsd';

const app: FastifyInstance = fastify();
app.register(wsPlugin);

app.register(wsPlugin, {
  handle: () => null,
});

app.register(wsPlugin, {
  options: {
    url: "/ws"
  }
});

const handler: WebsocketHandler = (
  connection,
  req,
  params
) => {
  expectType<SocketStream>(connection);
  expectType<IncomingMessage>(req);
  expectType<{ [key: string]: any } | undefined>(params);
};

app.get('/', { websocket: true }, handler);
