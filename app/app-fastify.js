// This line must come before importing any instrumented module.
const tracer = require('dd-trace').init()

const path = require('path')
require('app-module-path').addPath(path.resolve(__dirname, '..'))

const Fastify = require('fastify')
const config = require('config')
const http2 = require('http2')
const https = require('https')
const fs = require('fs')
const logger = require('app/logger')
const ContextFastify = require('app/context-fastify')

// Create Fastify instances for each server type
// HTTP/1.1 server
const app = Fastify({
  logger: false, // We have custom logger
  trustProxy: true
})

// Register plugins
app.register(require('@fastify/cookie'))
app.register(require('@fastify/formbody'))
app.register(require('@fastify/multipart'), {
  attachFieldsToBody: true
})

// CORS plugin
app.register(require('@fastify/cors'), {
  origin: (origin, callback) => {
    if (!origin || origin === config.host) {
      callback(null, false)
      return
    }

    for (const pattern of config.cors) {
      try {
        const regex = new RegExp(pattern, 'i')
        if (regex.test(origin)) {
          callback(null, true)
          return
        }
      } catch (err) {
        callback(err)
        return
      }
    }

    callback(null, false)
  },
  credentials: true,
  methods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Authorization',
    'Content-Type',
    'If-Match',
    'If-Modified-Since',
    'If-None-Match',
    'If-Unmodified-Since',
    'X-Requested-With'
  ]
})

// Static files
app.register(require('@fastify/static'), {
  root: path.join(__dirname, '..', 'public'),
  prefix: '/',
  prefixAvoidTrailingSlash: true
})

// Add context decorator
app.decorateRequest('ctx', null)

// Add context hook
app.addHook('onRequest', async (request, reply) => {
  request.ctx = new ContextFastify(request)
})

// Custom logger hook
app.addHook('onRequest', async (request, reply) => {
  request.startTime = process.hrtime.bigint()
})

app.addHook('onResponse', async (request, reply) => {
  const responseTimeNano = process.hrtime.bigint() - request.startTime
  const tags = {
    resource_name: `${request.method}_${request.url}`,
    'http.version': request.raw.httpVersion ? `http/${request.raw.httpVersion}` : 'http/2'
  }
  if (request.raw.socket && request.raw.socket.encrypted) {
    tags['tls.library'] = 'nodejs'
  }
  tracer.dogstatsd.histogram('node_httpbin.timer', Number(responseTimeNano / 1000000000n), tags)

  const info = {
    method: request.method,
    url: request.url,
    route: request.routeOptions?.url,
    status: reply.statusCode,
    responseTime: `${responseTimeNano / 1000000n}ms`
  }

  logger.info(JSON.stringify(info))
})

// Register routes
app.register(require('./router/httpbin-fastify'))
app.register(require('./router/version-fastify'))

// Error handler
app.setErrorHandler((error, request, reply) => {
  logger.error({ err: error }, error.message)
  reply.status(error.statusCode || 500).send({
    error: error.message
  })
})

// Start HTTP/1.1 server
app.listen({ port: config.port, host: '::' }, (err, address) => {
  if (err) {
    logger.error(err)
    process.exit(1)
  }
  logger.info(`listen ${address}`)
})

// HTTPS server
if (process.env.HTTPS_KEY_FILE && process.env.HTTPS_CERT_FILE) {
  const httpsApp = Fastify({
    logger: false,
    trustProxy: true,
    https: {
      key: fs.readFileSync(process.env.HTTPS_KEY_FILE),
      cert: fs.readFileSync(process.env.HTTPS_CERT_FILE)
    }
  })

  // Re-register everything for HTTPS app
  httpsApp.register(require('@fastify/cookie'))
  httpsApp.register(require('@fastify/formbody'))
  httpsApp.register(require('@fastify/multipart'), { attachFieldsToBody: true })
  httpsApp.register(require('@fastify/cors'), {
    origin: (origin, callback) => {
      if (!origin || origin === config.host) {
        callback(null, false)
        return
      }
      for (const pattern of config.cors) {
        try {
          const regex = new RegExp(pattern, 'i')
          if (regex.test(origin)) {
            callback(null, true)
            return
          }
        } catch (err) {
          callback(err)
          return
        }
      }
      callback(null, false)
    },
    credentials: true,
    methods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS', 'PATCH']
  })
  httpsApp.register(require('@fastify/static'), {
    root: path.join(__dirname, '..', 'public'),
    prefix: '/'
  })
  httpsApp.decorateRequest('ctx', null)
  httpsApp.addHook('onRequest', async (request, reply) => {
    request.ctx = new ContextFastify(request)
    request.startTime = process.hrtime.bigint()
  })
  httpsApp.addHook('onResponse', async (request, reply) => {
    const responseTimeNano = process.hrtime.bigint() - request.startTime
    const tags = {
      resource_name: `${request.method}_${request.url}`,
      'http.version': request.raw.httpVersion ? `http/${request.raw.httpVersion}` : 'http/2'
    }
    if (request.raw.socket && request.raw.socket.encrypted) {
      tags['tls.library'] = 'nodejs'
    }
    tracer.dogstatsd.histogram('node_httpbin.timer', Number(responseTimeNano / 1000000000n), tags)
    logger.info(JSON.stringify({
      method: request.method,
      url: request.url,
      route: request.routeOptions?.url,
      status: reply.statusCode,
      responseTime: `${responseTimeNano / 1000000n}ms`
    }))
  })
  httpsApp.register(require('./router/httpbin-fastify'))
  httpsApp.register(require('./router/version-fastify'))
  httpsApp.setErrorHandler((error, request, reply) => {
    logger.error({ err: error }, error.message)
    reply.status(error.statusCode || 500).send({ error: error.message })
  })

  httpsApp.listen({ port: config.tls_port, host: '::' }, (err, address) => {
    if (err) {
      logger.error(err)
      process.exit(1)
    }
    logger.info(`listen ${address}`)
  })
}

// HTTP/2 plaintext server
const http2App = Fastify({
  logger: false,
  trustProxy: true,
  http2: true
})

// Re-register everything for HTTP/2 plaintext
http2App.register(require('@fastify/cookie'))
http2App.register(require('@fastify/formbody'))
http2App.register(require('@fastify/multipart'), { attachFieldsToBody: true })
http2App.register(require('@fastify/cors'), {
  origin: (origin, callback) => {
    if (!origin || origin === config.host) {
      callback(null, false)
      return
    }
    for (const pattern of config.cors) {
      try {
        const regex = new RegExp(pattern, 'i')
        if (regex.test(origin)) {
          callback(null, true)
          return
        }
      } catch (err) {
        callback(err)
        return
      }
    }
    callback(null, false)
  },
  credentials: true,
  methods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS', 'PATCH']
})
http2App.register(require('@fastify/static'), {
  root: path.join(__dirname, '..', 'public'),
  prefix: '/'
})
http2App.decorateRequest('ctx', null)
http2App.addHook('onRequest', async (request, reply) => {
  request.ctx = new ContextFastify(request)
  request.startTime = process.hrtime.bigint()
})
http2App.addHook('onResponse', async (request, reply) => {
  const responseTimeNano = process.hrtime.bigint() - request.startTime
  const tags = {
    resource_name: `${request.method}_${request.url}`,
    'http.version': 'http/2'
  }
  tracer.dogstatsd.histogram('node_httpbin.timer', Number(responseTimeNano / 1000000000n), tags)
  logger.info(JSON.stringify({
    method: request.method,
    url: request.url,
    route: request.routeOptions?.url,
    status: reply.statusCode,
    responseTime: `${responseTimeNano / 1000000n}ms`
  }))
})
http2App.register(require('./router/httpbin-fastify'))
http2App.register(require('./router/version-fastify'))
http2App.setErrorHandler((error, request, reply) => {
  logger.error({ err: error }, error.message)
  reply.status(error.statusCode || 500).send({ error: error.message })
})

http2App.listen({ port: config.http2_port, host: '::' }, (err, address) => {
  if (err) {
    logger.error(err)
    process.exit(1)
  }
  logger.info(`HTTP/2 plaintext listening on ${address}`)
})

// HTTP/2 TLS server
if (process.env.HTTPS_KEY_FILE && process.env.HTTPS_CERT_FILE) {
  const http2TLSApp = Fastify({
    logger: false,
    trustProxy: true,
    http2: true,
    https: {
      key: fs.readFileSync(process.env.HTTPS_KEY_FILE),
      cert: fs.readFileSync(process.env.HTTPS_CERT_FILE),
      allowHTTP1: true
    }
  })

  // Re-register everything for HTTP/2 TLS
  http2TLSApp.register(require('@fastify/cookie'))
  http2TLSApp.register(require('@fastify/formbody'))
  http2TLSApp.register(require('@fastify/multipart'), { attachFieldsToBody: true })
  http2TLSApp.register(require('@fastify/cors'), {
    origin: (origin, callback) => {
      if (!origin || origin === config.host) {
        callback(null, false)
        return
      }
      for (const pattern of config.cors) {
        try {
          const regex = new RegExp(pattern, 'i')
          if (regex.test(origin)) {
            callback(null, true)
            return
          }
        } catch (err) {
          callback(err)
          return
        }
      }
      callback(null, false)
    },
    credentials: true,
    methods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS', 'PATCH']
  })
  http2TLSApp.register(require('@fastify/static'), {
    root: path.join(__dirname, '..', 'public'),
    prefix: '/'
  })
  http2TLSApp.decorateRequest('ctx', null)
  http2TLSApp.addHook('onRequest', async (request, reply) => {
    request.ctx = new ContextFastify(request)
    request.startTime = process.hrtime.bigint()
  })
  http2TLSApp.addHook('onResponse', async (request, reply) => {
    const responseTimeNano = process.hrtime.bigint() - request.startTime
    const tags = {
      resource_name: `${request.method}_${request.url}`,
      'http.version': 'http/2'
    }
    if (request.raw.socket && request.raw.socket.encrypted) {
      tags['tls.library'] = 'nodejs'
    }
    tracer.dogstatsd.histogram('node_httpbin.timer', Number(responseTimeNano / 1000000000n), tags)
    logger.info(JSON.stringify({
      method: request.method,
      url: request.url,
      route: request.routeOptions?.url,
      status: reply.statusCode,
      responseTime: `${responseTimeNano / 1000000n}ms`
    }))
  })
  http2TLSApp.register(require('./router/httpbin-fastify'))
  http2TLSApp.register(require('./router/version-fastify'))
  http2TLSApp.setErrorHandler((error, request, reply) => {
    logger.error({ err: error }, error.message)
    reply.status(error.statusCode || 500).send({ error: error.message })
  })

  http2TLSApp.listen({ port: config.http2_tls_port, host: '::' }, (err, address) => {
    if (err) {
      logger.error(err)
      process.exit(1)
    }
    logger.info(`HTTP/2 TLS listening on ${address}`)
  })
}

module.exports = app
