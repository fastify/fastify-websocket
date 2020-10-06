/// <reference types="node" />
import { IncomingMessage, ServerResponse, Server } from 'http';
import { FastifyPluginCallback, RawServerBase, RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression, RequestGenericInterface, ContextConfigDefault, FastifyInstance } from 'fastify';
import * as fastify from 'fastify';
import * as WebSocket from 'ws';
import { Duplex } from 'stream';

interface WebsocketRouteOptions {
  wsHandler?: WebsocketHandler
}
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
      opts: RouteShorthandOptions<RawServer, RawRequest, RawReply, RequestGeneric, ContextConfig> & { websocket: true }, // this creates an overload that only applies these different types if the handler is for websockets
      handler?: WebsocketHandler
    ): FastifyInstance<RawServer, RawRequest, RawReply>;
  }

  interface RouteOptions extends WebsocketRouteOptions {}
}

declare const websocketPlugin: FastifyPluginCallback<WebsocketPluginOptions>;

export type WebsocketHandler = (
  this: FastifyInstance<Server, IncomingMessage, ServerResponse>,
  connection: SocketStream,
  request: IncomingMessage,
  params?: { [key: string]: any }
) => void | Promise<any>;

export interface SocketStream extends Duplex {
  socket: WebSocket;
}

export interface WebsocketPluginOptions {
  handle?: (this: FastifyInstance, connection: SocketStream) => void;
  options?: WebSocket.ServerOptions;
}

export interface RouteOptions extends fastify.RouteOptions, WebsocketRouteOptions {}

export default websocketPlugin;
