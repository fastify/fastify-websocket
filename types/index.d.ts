/// <reference types="node" />
import * as fastify from 'fastify'
import { ContextConfigDefault, FastifyBaseLogger, FastifyInstance, FastifyPluginCallback, FastifyRequest, FastifySchema, FastifyTypeProvider, FastifyTypeProviderDefault, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerBase, RawServerDefault, RequestGenericInterface } from 'fastify'
import { preCloseAsyncHookHandler, preCloseHookHandler } from 'fastify/types/hooks'
import { FastifyReply } from 'fastify/types/reply'
import { RouteGenericInterface } from 'fastify/types/route'
import { IncomingMessage, Server, ServerResponse } from 'node:http'
import * as WebSocket from 'ws'

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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    RawServer extends RawServerBase = RawServerDefault
  > {
    websocket?: boolean;
  }

  interface InjectWSOption {
    onInit?: (ws: WebSocket.WebSocket) => void
    onOpen?: (ws: WebSocket.WebSocket) => void
  }

  type InjectWSFn<RawRequest> =
    ((path?: string, upgradeContext?: Partial<RawRequest>, options?: InjectWSOption) => Promise<WebSocket>)

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface FastifyInstance<RawServer, RawRequest, RawReply, Logger, TypeProvider> {
    websocketServer: WebSocket.Server,
    injectWS: InjectWSFn<RawRequest>
  }

  interface FastifyRequest {
    ws: boolean
  }

  interface RouteShorthandMethod<
    RawServer extends RawServerBase = RawServerDefault,
    RawRequest extends RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>,
    RawReply extends RawReplyDefaultExpression<RawServer> = RawReplyDefaultExpression<RawServer>,
    TypeProvider extends FastifyTypeProvider = FastifyTypeProviderDefault,
    Logger extends FastifyBaseLogger = FastifyBaseLogger
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    RawReply extends RawReplyDefaultExpression<RawServer> = RawReplyDefaultExpression<RawServer>,
    RouteGeneric extends RouteGenericInterface = RouteGenericInterface,
    ContextConfig = ContextConfigDefault,
    SchemaCompiler = fastify.FastifySchema,
    TypeProvider extends FastifyTypeProvider = FastifyTypeProviderDefault,
    Logger extends FastifyBaseLogger = FastifyBaseLogger
  > extends WebsocketRouteOptions<RawServer, RawRequest, RouteGeneric, ContextConfig, SchemaCompiler, TypeProvider, Logger> { }
}

type FastifyWebsocket = FastifyPluginCallback<fastifyWebsocket.WebsocketPluginOptions>

declare namespace fastifyWebsocket {

  interface WebSocketServerOptions extends Omit<WebSocket.ServerOptions, 'path'> { }
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
    socket: WebSocket.WebSocket,
    request: FastifyRequest<RequestGeneric, RawServer, RawRequest, SchemaCompiler, TypeProvider, ContextConfig, Logger>
  ) => void | Promise<any>
  export interface WebsocketPluginOptions {
    errorHandler?: (this: FastifyInstance, error: Error, socket: WebSocket.WebSocket, request: FastifyRequest, reply: FastifyReply) => void;
    options?: WebSocketServerOptions;
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

  export type WebSocket = WebSocket.WebSocket

  export const fastifyWebsocket: FastifyWebsocket
  export { fastifyWebsocket as default }
}

declare function fastifyWebsocket (...params: Parameters<FastifyWebsocket>): ReturnType<FastifyWebsocket>
export = fastifyWebsocket
