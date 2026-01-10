const constants = require('app/constants')

// HTTP/2-compatible IP getter
function getClientIp (req) {
  // Check X-Forwarded-For header first (common for proxies)
  const xForwardedFor = req.headers['x-forwarded-for']
  if (xForwardedFor) {
    const ips = xForwardedFor.split(',').map(ip => ip.trim())
    return ips[0]
  }

  // Try to get from socket (works for both HTTP/1.1 and HTTP/2)
  if (req.socket && req.socket.remoteAddress) {
    return req.socket.remoteAddress
  }

  // HTTP/2 specific: try stream.session.socket
  if (req.stream && req.stream.session && req.stream.session.socket) {
    return req.stream.session.socket.remoteAddress
  }

  // Fallback to connection object (HTTP/1.1)
  if (req.connection && req.connection.remoteAddress) {
    return req.connection.remoteAddress
  }

  return constants.UnKnown
}

class Context {
  constructor (req, res) {
    this.req = req
    this.res = res
  }

  get method () {
    return this.req.method
  }

  get url () {
    // Determine protocol
    let protocol = 'http'

    // Check for Express-style protocol property
    if (this.req.protocol) {
      protocol = this.req.protocol
    } else {
      // Check if encrypted (HTTPS)
      if (this.req.socket && this.req.socket.encrypted) {
        protocol = 'https'
      }
      // Check X-Forwarded-Proto header
      const forwardedProto = this.req.headers['x-forwarded-proto']
      if (forwardedProto) {
        protocol = forwardedProto
      }
    }

    return `${protocol}://${this.req.headers.host}${this.req.url}`
  }

  get ip () {
    return getClientIp(this.req)
  }

  get headers () {
    return this.req.headers
  }

  get ua () {
    return this.headers['user-agent'] || constants.UnKnown
  }

  get query () {
    return this.req.query
  }

  get text () {
    if (this.req.is('text/*')) {
      return this.req.body
    }
  }

  get body () {
    if (this.req.is('json')) {
      return this.req.body
    }
    return {}
  }

  get form () {
    if (this.req.is('application/x-www-form-urlencoded')) {
      return this.req.body
    }
    return {}
  }

  get files () {
    if (!this.req.files) {
      return {}
    }

    return this.req.files.reduce((files, file) => {
      files[file.fieldname] = file.buffer.toString()
      return files
    }, {})
  }

  get cookies () {
    return this.req.cookies
  }
}

module.exports = Context
