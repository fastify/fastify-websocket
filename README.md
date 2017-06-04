# fastify-websocket

WebSocket support for [Fastify](https://github.com/fastify/fastify).
Built upon [websocket-stream](http://npm.im/websocket-stream).

## Example

```js
'use strict'

const fastify = require('fastify')()

fastify.register(require('fastify-websocket'), { handle })

function handle (conn) {
  conn.pipe(conn) // creates a echo server
}

fastify.listen(0)
```

## TODO

* [ ] Support Hooks?

## Acknowledgements

This project is kindly sponsored by [nearForm](http://nearform.com).

## License

Licensed under [MIT](./LICENSE).
