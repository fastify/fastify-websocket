/// <reference types="node" />
import { IncomingMessage, ServerResponse, Server } from 'http';
import { FastifyPlugin, FastifyRequest, RawServerBase, RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression, RequestGenericInterface, ContextConfigDefault } from 'fastify';
import * as WebSocket from 'ws';
import { Duplex } from 'stream';

declare module 'fastify' {
  interface RouteShorthandOptions<
    RawServer extends RawServerBase = RawServerDefault
  > {
    websocket?: boolean;
  }

  interface FastifyInstance<RawServer, RawRequest, RawReply> {
    get: RouteShorthandMethod<RawServer, RawRequest, RawReply>
    websocketServer: WebSocket.Server,
  }

  interface RouteShorthandMethod<
    RawServer extends RawServerBase = RawServerDefault,
    RawRequest extends RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>,
    RawReply extends RawReplyDefaultExpression<RawServer> = RawReplyDefaultExpression<RawServer>,
  > {
    <RequestGeneric extends RequestGenericInterface = RequestGenericInterface, ContextConfig = ContextConfigDefault>(
      path: string,
      opts: RouteShorthandOptions<RawServer, RawRequest, RawReply, RequestGeneric, ContextConfig>,
      handler?: WebsocketHandler
    ): FastifyInstance<RawServer, RawRequest, RawReply>;
  }

  export type WebsocketHandler = (
    this: FastifyInstance<Server, IncomingMessage, ServerResponse>,
    connection: SocketStream,
    request: FastifyRequest,
    params?: { [key: string]: any }
  ) => void | Promise<any>;
}

export interface SocketStream extends Duplex {
  socket: WebSocket;
}

export interface WebsocketPluginOptions {
  handle?: (connection: SocketStream) => void;
  options?: WebSocket.ServerOptions;
}

declare const websocketPlugin: FastifyPlugin<WebsocketPluginOptions>;

export default websocketPlugin;
