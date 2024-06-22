const path = require('path')
require('app-module-path').addPath(path.resolve(__dirname, '..'))

const express = require('express')
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const config = require('config')
const https = require('https')
const spdy = require('spdy')
const fs = require('fs')
const logger = require('app/logger')
const partialResponse = require('express-partial-response')

const app = express()

// for x-forwarded-proto
app.set('trust proxy', true)
app.use(require('app/middleware/prettify'))
app.use(require('app/middleware/logger'))
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
const httpsOptions = {
  key: fs.readFileSync(process.env.HTTPS_KEY_FILE),
  cert: fs.readFileSync(process.env.HTTPS_CERT_FILE)
};

const httpsServer = https.createServer(httpsOptions, app)
httpsServer.listen(config.tls_port, () => {
  const address = httpsServer.address()
  logger.info(`listen ${address.address}:${address.port}`)
});

// HTTP2
const http2Options = {
  spdy: {
    protocol: 'h2',
    plain: true,
    // **optional**
    // Parse first incoming X_FORWARDED_FOR frame and put it to the
    // headers of every request.
    // NOTE: Use with care! This should not be used without some proxy that
    // will *always* send X_FORWARDED_FOR
    'x-forwarded-for': true
  }
}
const http2Server = spdy.createServer(http2Options, app);
http2Server.listen(config.http2_port, () => {
  const address = http2Server.address()
  logger.info(`listen ${address.address}:${address.port}`)
});

const http2TLSOptions = {
  key: fs.readFileSync(process.env.HTTPS_KEY_FILE),
  cert: fs.readFileSync(process.env.HTTPS_CERT_FILE),
  spdy: {
    protocols: ['h2'],
    plain: false,
    ssl: true,
    // **optional**
    // Parse first incoming X_FORWARDED_FOR frame and put it to the
    // headers of every request.
    // NOTE: Use with care! This should not be used without some proxy that
    // will *always* send X_FORWARDED_FOR
    'x-forwarded-for': true
  }
}
const http2TLSServer = spdy.createServer(http2TLSOptions, app);
http2TLSServer.listen(config.http2_tls_port, () => {
  const address = http2TLSServer.address()
  logger.info(`listen ${address.address}:${address.port}`)
});

module.exports = app
