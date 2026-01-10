// This line must come before importing any instrumented module.
const tracer = require('dd-trace').init()

const path = require('path')
require('app-module-path').addPath(path.resolve(__dirname, '..'))

const express = require('express')
const http2Express = require('http2-express-bridge')
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const config = require('config')
const https = require('https')
const http2 = require('http2')
const fs = require('fs')
const logger = require('app/logger')
const partialResponse = require('express-partial-response')

const app = http2Express(express)

// for x-forwarded-proto
app.set('trust proxy', true)
app.use(require('app/middleware/prettify'))
const loggerMiddleware = require('app/middleware/logger')
app.use(loggerMiddleware(tracer))
app.use(require('app/middleware/context'))
app.use(partialResponse())
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.text())
app.use(cookieParser())

app.use(require('./middleware/cors'))
app.use(require('./middleware/multer'))

app.use('/version', require('./router/version'))
app.use(require('./router/httpbin'))

app.use(require('./middleware/error-handler'))

const server = app.listen(config.port, () => {
  const address = server.address()
  logger.info(`listen ${address.address}:${address.port}`)
})

// HTTPS server
if (process.env.HTTPS_KEY_FILE && process.env.HTTPS_CERT_FILE) {
  const httpsOptions = {
    key: fs.readFileSync(process.env.HTTPS_KEY_FILE),
    cert: fs.readFileSync(process.env.HTTPS_CERT_FILE)
  }

  const httpsServer = https.createServer(httpsOptions, app)
  httpsServer.listen(config.tls_port, () => {
    const address = httpsServer.address()
    logger.info(`listen ${address.address}:${address.port}`)
  })
}

// HTTP2 plaintext (h2c)
// allowHTTP1: true provides better Express compatibility while supporting HTTP/2
const http2Options = {
  allowHTTP1: true
}
const http2Server = http2.createServer(http2Options, app)
http2Server.listen(config.http2_port, () => {
  const address = http2Server.address()
  logger.info(`HTTP/2 plaintext listening on ${address.address}:${address.port}`)
})

if (process.env.HTTPS_KEY_FILE && process.env.HTTPS_CERT_FILE) {
  const http2TLSOptions = {
    key: fs.readFileSync(process.env.HTTPS_KEY_FILE),
    cert: fs.readFileSync(process.env.HTTPS_CERT_FILE),
    allowHTTP1: true // Supports both HTTP/2 and HTTP/1.1 for better compatibility
  }
  const http2TLSServer = http2.createSecureServer(http2TLSOptions, app)
  http2TLSServer.listen(config.http2_tls_port, () => {
    const address = http2TLSServer.address()
    logger.info(`HTTP/2 TLS listening on ${address.address}:${address.port}`)
  })
}

module.exports = app
