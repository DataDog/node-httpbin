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

class ContextFastify {
  constructor (fastifyRequest) {
    this.fastifyRequest = fastifyRequest
    this.req = fastifyRequest.raw
  }

  get method () {
    return this.req.method
  }

  get url () {
    // Determine protocol
    let protocol = 'http'

    // Check if encrypted (HTTPS)
    if (this.req.socket && this.req.socket.encrypted) {
      protocol = 'https'
    }
    // Check X-Forwarded-Proto header
    const forwardedProto = this.req.headers['x-forwarded-proto']
    if (forwardedProto) {
      protocol = forwardedProto
    }

    // HTTP/2 uses :authority pseudo-header, HTTP/1.1 uses host header
    const host = this.req.headers[':authority'] || this.req.headers.host || 'unknown'

    return `${protocol}://${host}${this.req.url}`
  }

  get ip () {
    return getClientIp(this.req)
  }

  get headers () {
    // Filter out HTTP/2 pseudo-headers (starting with :)
    const headers = {}
    for (const [key, value] of Object.entries(this.req.headers)) {
      if (!key.startsWith(':')) {
        headers[key] = value
      }
    }
    return headers
  }

  get ua () {
    return this.headers['user-agent'] || constants.UnKnown
  }

  get query () {
    return this.fastifyRequest.query || {}
  }

  get text () {
    const contentType = this.req.headers['content-type'] || ''
    if (contentType.includes('text/')) {
      return this.fastifyRequest.body
    }
  }

  get body () {
    const contentType = this.req.headers['content-type'] || ''
    if (contentType.includes('application/json')) {
      return this.fastifyRequest.body
    }
    return {}
  }

  get form () {
    const contentType = this.req.headers['content-type'] || ''
    if (contentType.includes('application/x-www-form-urlencoded')) {
      return this.fastifyRequest.body
    }
    return {}
  }

  get files () {
    // Fastify multipart doesn't populate files in the same way
    // For now return empty object - file uploads need special handling in Fastify
    return {}
  }

  get cookies () {
    return this.fastifyRequest.cookies || {}
  }
}

module.exports = ContextFastify
