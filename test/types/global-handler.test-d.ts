import websocketPlugin = require('../../index');
const fastify = require('fastify');
import { FastifyInstance } from 'fastify';
import { SocketStream } from '../../index';
import * as WebSocket from 'ws';
import { expectType } from 'tsd';

const app: FastifyInstance = fastify();
function handle (ws: WebSocket | SocketStream) {
    expectType<SocketStream | WebSocket>(ws)
}

app.register(websocketPlugin, {
    handle,
    options: {
        path: '/ws'
    },
    stream: false,
});
