/// <reference types="node" />
import { IncomingMessage, ServerResponse, Server } from 'http';
import { FastifyRequest, FastifyPluginCallback, RawServerBase, RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression, RequestGenericInterface, ContextConfigDefault, FastifyInstance, FastifySchema, FastifyTypeProvider, FastifyTypeProviderDefault, FastifyBaseLogger } from 'fastify';
import * as fastify from 'fastify';
import * as WebSocket from 'ws';
import { Duplex, DuplexOptions } from 'stream';
import { FastifyReply } from 'fastify/types/reply';
import { preCloseHookHandler, preCloseAsyncHookHandler } from 'fastify/types/hooks';
import { RouteGenericInterface } from 'fastify/types/route';

interface WebsocketRouteOptions<
  RawServer extends RawServerBase = RawServerDefault,
  RawRequest extends RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>,
  RequestGeneric extends RequestGenericInterface = RequestGenericInterface,
  ContextConfig = ContextConfigDefault,
  SchemaCompiler extends FastifySchema = FastifySchema,
  TypeProvider extends FastifyTypeProvider = FastifyTypeProviderDefault,
  Logger extends FastifyBaseLogger = FastifyBaseLogger
> {
  wsHandler?: fastifyWebsocket.WebsocketHandler<RawServer, RawRequest, RequestGeneric, ContextConfig, SchemaCompiler, TypeProvider, Logger>;
}

declare module 'fastify' {
  interface RouteShorthandOptions<
    RawServer extends RawServerBase = RawServerDefault
  > {
    websocket?: boolean;
  }

  interface FastifyInstance<RawServer, RawRequest, RawReply, Logger, TypeProvider> {
    get: RouteShorthandMethod<RawServer, RawRequest, RawReply, TypeProvider, Logger>,
    websocketServer: WebSocket.Server,
  }

  interface FastifyRequest {
    ws: boolean
  }

  interface RouteShorthandMethod<
    RawServer extends RawServerBase = RawServerDefault,
    RawRequest extends RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>,
    RawReply extends RawReplyDefaultExpression<RawServer> = RawReplyDefaultExpression<RawServer>,
    TypeProvider extends FastifyTypeProvider = FastifyTypeProviderDefault,
    Logger extends FastifyBaseLogger = FastifyBaseLogger,
  > {
    <RequestGeneric extends RequestGenericInterface = RequestGenericInterface, ContextConfig = ContextConfigDefault, SchemaCompiler extends FastifySchema = FastifySchema, InnerLogger extends Logger = Logger>(
      path: string,
      opts: RouteShorthandOptions<RawServer, RawRequest, RawReply, RequestGeneric, ContextConfig, SchemaCompiler, TypeProvider, InnerLogger> & { websocket: true }, // this creates an overload that only applies these different types if the handler is for websockets
      handler?: fastifyWebsocket.WebsocketHandler<RawServer, RawRequest, RequestGeneric, ContextConfig, SchemaCompiler, TypeProvider, InnerLogger>
    ): FastifyInstance<RawServer, RawRequest, RawReply, InnerLogger, TypeProvider>;
  }

  interface RouteOptions<
    RawServer extends RawServerBase = RawServerDefault,
    RawRequest extends RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>,
    RawReply extends RawReplyDefaultExpression<RawServer> = RawReplyDefaultExpression<RawServer>,
    RouteGeneric extends RouteGenericInterface = RouteGenericInterface,
    ContextConfig = ContextConfigDefault,
    SchemaCompiler = fastify.FastifySchema,
    TypeProvider extends FastifyTypeProvider = FastifyTypeProviderDefault,
    Logger extends FastifyBaseLogger = FastifyBaseLogger
  > extends WebsocketRouteOptions<RawServer, RawRequest, RouteGeneric, ContextConfig, SchemaCompiler, TypeProvider, Logger> { }
}

type FastifyWebsocket = FastifyPluginCallback<fastifyWebsocket.WebsocketPluginOptions>;

declare namespace fastifyWebsocket {

  interface WebSocketServerOptions extends Omit<WebSocket.ServerOptions, "path"> { }
  
  export type WebsocketHandler<
    RawServer extends RawServerBase = RawServerDefault,
    RawRequest extends RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>,
    RequestGeneric extends RequestGenericInterface = RequestGenericInterface,
    ContextConfig = ContextConfigDefault,
    SchemaCompiler extends FastifySchema = FastifySchema,
    TypeProvider extends FastifyTypeProvider = FastifyTypeProviderDefault,
    Logger extends FastifyBaseLogger = FastifyBaseLogger
  > = (
    this: FastifyInstance<Server, IncomingMessage, ServerResponse>,
    connection: SocketStream,
    request: FastifyRequest<RequestGeneric, RawServer, RawRequest, SchemaCompiler, TypeProvider, ContextConfig, Logger>
  ) => void | Promise<any>;
  
  export interface SocketStream extends Duplex {
    socket: WebSocket;
  }
  
  export interface WebsocketPluginOptions {
    errorHandler?: (this: FastifyInstance, error: Error, connection: SocketStream, request: FastifyRequest, reply: FastifyReply) => void;
    options?: WebSocketServerOptions;
    connectionOptions?: DuplexOptions;
    preClose?: preCloseHookHandler | preCloseAsyncHookHandler;
  }

  export interface RouteOptions<
    RawServer extends RawServerBase = RawServerDefault,
    RawRequest extends RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>,
    RawReply extends RawReplyDefaultExpression<RawServer> = RawReplyDefaultExpression<RawServer>,
    RouteGeneric extends RouteGenericInterface = RouteGenericInterface,
    ContextConfig = ContextConfigDefault,
    SchemaCompiler extends fastify.FastifySchema = fastify.FastifySchema,
    TypeProvider extends FastifyTypeProvider = FastifyTypeProviderDefault,
    Logger extends FastifyBaseLogger = FastifyBaseLogger
  > extends fastify.RouteOptions<RawServer, RawRequest, RawReply, RouteGeneric, ContextConfig, SchemaCompiler, TypeProvider, Logger>, WebsocketRouteOptions<RawServer, RawRequest, RouteGeneric, ContextConfig, SchemaCompiler, TypeProvider, Logger> { }

  export const fastifyWebsocket: FastifyWebsocket
  export { fastifyWebsocket as default }
}

declare function fastifyWebsocket(...params: Parameters<FastifyWebsocket>): ReturnType<FastifyWebsocket>
export = fastifyWebsocket
