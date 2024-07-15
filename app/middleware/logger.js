const _ = require('lodash')
const logger = require('app/logger')

function loggerWithTracer(tracer) {
  return function (req, res, next) {
    const startTimeNano = process.hrtime.bigint()

    if (req.hasOwnProperty("spdyStream")) {
      req.on('close', onResFinishedSPDY(tracer, startTimeNano))
      res.on('error', onResFinishedSPDY(tracer, startTimeNano))
    } else {
      res.on('finish', onResFinishedExpress(tracer, startTimeNano))
      res.on('error', onResFinishedExpress(tracer, startTimeNano))
    }

    next()
  }
}

module.exports = loggerWithTracer

// `this` will be res
function onResFinishedExpress(tracer, startTimeNano) {
  return function onResFinished (err) {
    this.removeListener('error', onResFinishedExpress(tracer, startTimeNano))
    this.removeListener('finish', onResFinishedExpress(tracer, startTimeNano))

    commonImplementation(this.req, this, err, tracer, startTimeNano, "1.1")
  }
}

function onResFinishedSPDY(tracer, startTimeNano) {
  return function onResFinished (err) {
    this.removeListener('close', onResFinishedSPDY(tracer, startTimeNano))
    this.removeListener('error', onResFinishedSPDY(tracer, startTimeNano))

    commonImplementation(this.ctx.req, this.ctx.res, err, tracer, startTimeNano, "2")
  }
}

function commonImplementation(req, res, err, tracer, startTimeNano, httpVersion) {
  const responseTimeNano = process.hrtime.bigint() - startTimeNano
  let tags = [`resource_name:${req.method}_${req.route.path}`, `http.version:http/${httpVersion}`]
  if (req.connection.encrypted !== undefined) {
    tags.push("tls.library:node")
  }
  console.log(tags)
  tracer.dogstatsd.histogram("node_httpbin.timer", responseTimeNano / 1000000000n, tags, 1)

  const info = {
    method: req.method,
    url: req.url,
    route: _.get(req, 'route.path'),
    status: res.statusCode,
    responseTime: `${responseTimeNano/1000000n}ms`
  }

  let useLevel = 'info'

  if (err) {
    useLevel = 'error'

    info.err = {
      message: err.message,
      stack: err.stack
    }
  }

  logger[useLevel](JSON.stringify(info))
}
