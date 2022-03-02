/// <reference types="node" />
import { IncomingMessage, ServerResponse, Server } from 'http';
import { FastifyRequest, FastifyPluginCallback, RawServerBase, RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression, RequestGenericInterface, ContextConfigDefault, FastifyInstance } from 'fastify';
import * as fastify from 'fastify';
import * as WebSocket from 'ws';
import { Duplex, DuplexOptions } from 'stream';
import { FastifyReply } from 'fastify/types/reply';
import { RouteGenericInterface } from 'fastify/types/route';

interface WebsocketRouteOptions<RawServer extends RawServerBase = RawServerDefault, RawRequest extends RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>, RequestGeneric extends RequestGenericInterface = RequestGenericInterface> {
  wsHandler?: WebsocketHandler<RawServer, RawRequest, RequestGeneric>;
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

  interface FastifyRequest {
    ws: boolean
  }

  interface RouteShorthandMethod<
    RawServer extends RawServerBase = RawServerDefault,
    RawRequest extends RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>,
    RawReply extends RawReplyDefaultExpression<RawServer> = RawReplyDefaultExpression<RawServer>,
  > {
    <RequestGeneric extends RequestGenericInterface = RequestGenericInterface, ContextConfig = ContextConfigDefault>(
      path: string,
      opts: RouteShorthandOptions<RawServer, RawRequest, RawReply, RequestGeneric, ContextConfig> & { websocket: true }, // this creates an overload that only applies these different types if the handler is for websockets
      handler?: WebsocketHandler<RawServer, RawRequest, RequestGeneric>
    ): FastifyInstance<RawServer, RawRequest, RawReply>;
  }

  interface RouteOptions<RawServer extends RawServerBase = RawServerDefault, RawRequest extends RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>, RawReply extends RawReplyDefaultExpression<RawServer> = RawReplyDefaultExpression<RawServer>, RouteGeneric extends RouteGenericInterface = RouteGenericInterface, ContextConfig = ContextConfigDefault,SchemaCompiler = fastify.FastifySchema> extends WebsocketRouteOptions<RawServer, RawRequest, RouteGeneric> {}
}

declare const websocketPlugin: FastifyPluginCallback<WebsocketPluginOptions>;

interface WebSocketServerOptions extends Omit<WebSocket.ServerOptions, "path"> {}

export type WebsocketHandler<
  RawServer extends RawServerBase = RawServerDefault,
  RawRequest extends RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>,
  RequestGeneric extends RequestGenericInterface = RequestGenericInterface
> = (
  this: FastifyInstance<Server, IncomingMessage, ServerResponse>,
  connection: SocketStream,
  request: FastifyRequest<RequestGeneric, RawServer, RawRequest>,
) => void | Promise<any>;

export interface SocketStream extends Duplex {
  socket: WebSocket;
}

export interface WebsocketPluginOptions {
  errorHandler?: (this: FastifyInstance, error: Error, connection: SocketStream, request: FastifyRequest, reply: FastifyReply) => void;
  options?: WebSocketServerOptions;
  connectionOptions?: DuplexOptions;
}

export interface RouteOptions<RawServer extends RawServerBase = RawServerDefault, RawRequest extends RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>, RawReply extends RawReplyDefaultExpression<RawServer> = RawReplyDefaultExpression<RawServer>, RouteGeneric extends RouteGenericInterface = RouteGenericInterface, ContextConfig = ContextConfigDefault, SchemaCompiler = fastify.FastifySchema> extends fastify.RouteOptions<RawServer, RawRequest, RawReply, RouteGeneric, ContextConfig, SchemaCompiler>, WebsocketRouteOptions<RawServer, RawRequest, RouteGeneric> {}

export default websocketPlugin;
