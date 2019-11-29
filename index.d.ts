/// <reference types="node" />
import * as fastify from 'fastify';
import { IncomingMessage, ServerResponse, Server } from 'http';
import { Plugin } from 'fastify';
import * as WebSocket from 'ws';
import { Duplex } from 'stream';

declare module 'fastify' {
  interface RouteShorthandOptions<
    HttpServer,
    HttpRequest,
    HttpResponse,
    Query,
    Params,
    Headers,
    Body
  > {
    websocket?: boolean;
  }
  interface FastifyInstance<
    HttpServer = Server,
    HttpRequest = IncomingMessage,
    HttpResponse = ServerResponse
  > {
    get<
      Query = DefaultQuery,
      Params = DefaultParams,
      Headers = DefaultHeaders,
      Body = DefaultBody
    >(
      url: string,
      opts: RouteShorthandOptions<
        HttpServer,
        HttpRequest,
        HttpResponse,
        Query,
        Params,
        Headers,
        Body
      >,
      handler?: WebsocketHandler<HttpRequest, HttpResponse>
    ): FastifyInstance<HttpServer, HttpRequest, HttpResponse>;
  }

  interface RouteOptions<
    HttpServer = Server,
    HttpRequest = IncomingMessage,
    HttpResponse = ServerResponse,
    Query = DefaultQuery,
    Params = DefaultParams,
    Headers = DefaultHeaders,
    Body = DefaultBody
  > {
    wsHandler?: WebsocketHandler<
      HttpRequest,
      HttpResponse,
      Query,
      Params,
      Headers,
      Body
    >;
  }

  export type WebsocketHandler<
    HttpRequest = IncomingMessage,
    HttpResponse = ServerResponse,
    Query = DefaultQuery,
    Params = DefaultParams,
    Headers = DefaultHeaders,
    Body = DefaultBody
  > = (
    this: FastifyInstance<Server, HttpRequest, HttpResponse>,
    connection: websocketPlugin.SocketStream,
    request: FastifyRequest<HttpRequest, Query, Params, Headers, Body>,
    params?: { [key: string]: any }
  ) => void | Promise<any>;
}

declare namespace websocketPlugin {
  export interface SocketStream extends Duplex {
    socket: WebSocket;
  }

  export interface PluginOptions {
    handle: (connection: SocketStream) => void;
    options: WebSocket.ServerOptions;
  }
}

declare const websocketPlugin: Plugin<
  Server,
  IncomingMessage,
  ServerResponse,
  websocketPlugin.PluginOptions
>;

export = websocketPlugin;
