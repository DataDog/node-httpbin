const zlib = require('zlib')
const http = require('http')
const crypto = require('crypto')
const path = require('path')
const { promisify } = require('util')

const _ = require('lodash')
const accepts = require('accepts')
const mime = require('mime-types')
const basicAuth = require('basic-auth')
const uuid = require('app/util/uuid')
const base64 = require('app/util/base64')
const toInt = require('app/util/toint')
const constants = require('app/constants')

const gzipAsync = promisify(zlib.gzip)
const deflateAsync = promisify(zlib.deflate)
const brotliCompressAsync = promisify(zlib.brotliCompress)

async function routes (fastify, options) {
  // Static file routes
  fastify.get('/', async (request, reply) => {
    reply.header(constants.HTTPHeaderContentType, mime.types.html)
    return reply.sendFile('index.html')
  })

  fastify.get('/favicon.ico', async (request, reply) => {
    return reply.sendFile('favicon.ico')
  })

  fastify.get('/favicon.png', async (request, reply) => {
    return reply.sendFile('favicon.png')
  })

  // Basic info endpoints
  fastify.get('/ip', async (request, reply) => {
    return {
      origin: request.ctx.ip
    }
  })

  fastify.get('/uuid', async (request, reply) => {
    return {
      uuid: uuid()
    }
  })

  fastify.get('/user-agent', async (request, reply) => {
    return {
      'user-agent': request.ctx.ua
    }
  })

  fastify.get('/headers', async (request, reply) => {
    return {
      headers: request.ctx.headers
    }
  })

  fastify.get('/get', async (request, reply) => {
    return {
      args: request.ctx.query,
      headers: request.ctx.headers,
      origin: request.ctx.ip,
      url: request.ctx.url
    }
  })

  // HTTP methods
  const methodHandler = async (request, reply) => {
    return {
      args: request.ctx.query,
      data: request.ctx.text,
      files: request.ctx.files,
      form: request.ctx.form,
      headers: request.ctx.headers,
      json: request.ctx.body,
      origin: request.ctx.ip,
      url: request.ctx.url
    }
  }

  fastify.post('/post', methodHandler)
  fastify.patch('/patch', methodHandler)
  fastify.put('/put', methodHandler)
  fastify.delete('/delete', methodHandler)

  // Anything endpoint
  const anythingHandler = async (request, reply) => {
    return {
      args: request.ctx.query,
      data: request.ctx.text,
      files: request.ctx.files,
      form: request.ctx.form,
      headers: request.ctx.headers,
      json: request.ctx.body,
      method: request.ctx.method,
      origin: request.ctx.ip,
      url: request.ctx.url
    }
  }

  fastify.all('/anything', anythingHandler)
  fastify.all('/anything/:anything', anythingHandler)

  // Base64 decode
  fastify.get('/base64/:encoded', async (request, reply) => {
    const encoded = request.params.encoded
    return reply.send(base64.decode(encoded))
  })

  // Encoding
  fastify.get('/encoding/utf8', async (request, reply) => {
    reply.header(constants.HTTPHeaderContentType, 'text/html; charset=UTF-8')
    return reply.sendFile('UTF-8-demo.txt')
  })

  // Compression endpoints
  fastify.get('/gzip', async (request, reply) => {
    reply.header(constants.HTTPHeaderContentEncoding, 'gzip')
    reply.removeHeader(constants.HTTPHeaderContentLength)
    reply.header(constants.HTTPHeaderContentType, mime.types.json)

    const result = await gzipAsync(JSON.stringify({
      gzipped: true,
      headers: request.ctx.headers,
      method: request.ctx.method,
      origin: request.ctx.ip
    }))

    return reply.send(result)
  })

  fastify.get('/deflate', async (request, reply) => {
    reply.header(constants.HTTPHeaderContentEncoding, 'deflate')
    reply.removeHeader(constants.HTTPHeaderContentLength)
    reply.header(constants.HTTPHeaderContentType, mime.types.json)

    const result = await deflateAsync(JSON.stringify({
      deflated: true,
      headers: request.ctx.headers,
      method: request.ctx.method,
      origin: request.ctx.ip
    }))

    return reply.send(result)
  })

  fastify.get('/brotli', async (request, reply) => {
    reply.header(constants.HTTPHeaderContentEncoding, 'br')
    reply.removeHeader(constants.HTTPHeaderContentLength)
    reply.header(constants.HTTPHeaderContentType, mime.types.json)

    const result = await brotliCompressAsync(Buffer.from(JSON.stringify({
      brotli: true,
      headers: request.ctx.headers,
      method: request.ctx.method,
      origin: request.ctx.ip
    })))

    return reply.send(result)
  })

  // Status codes
  fastify.all('/status/:code', async (request, reply) => {
    const code = request.params.code

    const isValidCode = !!http.STATUS_CODES[code]
    if (!isValidCode) {
      return reply.code(400).send(`invalid status code: ${code}`)
    }

    return reply.code(parseInt(code, 10)).send({
      code,
      message: http.STATUS_CODES[code]
    })
  })

  // Response headers
  fastify.all('/response-headers', async (request, reply) => {
    const query = request.ctx.query

    for (const key in query) {
      const val = query[key]
      reply.header(key, `${val}`)
    }

    return query
  })

  // Redirects
  fastify.get('/redirect/:n', async (request, reply) => {
    const n = _.toInteger(request.params.n)

    if (!_.inRange(n, 1, 16)) {
      return reply.code(400).send('`n` should be a number in [1, 15]')
    }

    if (n > 1) {
      return reply.redirect(`/redirect/${n - 1}`)
    } else {
      return reply.redirect('/get')
    }
  })

  fastify.get('/relative-redirect/:n', async (request, reply) => {
    const n = _.toInteger(request.params.n)

    if (!_.inRange(n, 1, 16)) {
      return reply.code(400).send('`n` should be a number in [1, 15]')
    }

    if (n > 1) {
      return reply.redirect(`/relative-redirect/${n - 1}`)
    } else {
      return reply.redirect('/get')
    }
  })

  fastify.get('/absolute-redirect/:n', async (request, reply) => {
    const n = _.toInteger(request.params.n)

    if (!_.inRange(n, 1, 16)) {
      return reply.code(400).send('`n` should be a number in [1, 15]')
    }

    if (n > 1) {
      return reply.redirect(`/absolute-redirect/${n - 1}`)
    } else {
      return reply.redirect('/get')
    }
  })

  fastify.all('/redirect-to', async (request, reply) => {
    const query = request.ctx.query

    const url = query.url
    if (!url) {
      return reply.code(400).send('query `url` required')
    }

    let code = _.toInteger(query.status_code)
    if (code === 0) {
      code = 302
    }

    if (!_.inRange(code, 300, 400)) {
      return reply.code(400).send('query `status_code` should be a number in [300, 400)')
    }

    return reply.code(code).redirect(url)
  })

  // Cookies
  fastify.get('/cookies', async (request, reply) => {
    return {
      cookies: request.ctx.cookies
    }
  })

  fastify.get('/cookies/set', async (request, reply) => {
    const query = request.ctx.query

    for (const key in query) {
      reply.setCookie(key, `${query[key]}`)
    }

    return reply.redirect('/cookies')
  })

  fastify.get('/cookies/delete', async (request, reply) => {
    const query = request.ctx.query

    for (const key in query) {
      reply.clearCookie(key)
    }

    return reply.redirect('/cookies')
  })

  // Images
  fastify.get('/image', async (request, reply) => {
    const accept = accepts(request.raw)

    let acceptType = accept.type(['jpg', 'jpeg', 'webp', 'svg', 'png', 'image/*'])

    let file
    switch (acceptType) {
      case 'jpg':
      case 'jpeg':
        file = 'jackal.jpg'
        break
      case 'svg':
        file = 'svg_logo.svg'
        break
      case 'webp':
        file = 'wolf_1.webp'
        break
      case 'image/*':
        acceptType = 'png'
        // falls through
      case 'png':
        file = 'pig_icon.png'
        break
      default:
        return reply.code(406).send()
    }

    reply.header(constants.HTTPHeaderContentType, mime.types[acceptType])
    return reply.sendFile(file, path.join(process.cwd(), 'public', 'images'))
  })

  fastify.get('/image/png', async (request, reply) => {
    reply.header(constants.HTTPHeaderContentType, mime.types.png)
    return reply.sendFile('pig_icon.png', path.join(process.cwd(), 'public', 'images'))
  })

  fastify.get('/image/jpeg', async (request, reply) => {
    reply.header(constants.HTTPHeaderContentType, mime.types.jpg)
    return reply.sendFile('jackal.jpg', path.join(process.cwd(), 'public', 'images'))
  })

  fastify.get('/image/webp', async (request, reply) => {
    reply.header(constants.HTTPHeaderContentType, mime.types.webp)
    return reply.sendFile('wolf_1.webp', path.join(process.cwd(), 'public', 'images'))
  })

  fastify.get('/image/svg', async (request, reply) => {
    reply.header(constants.HTTPHeaderContentType, mime.types.svg)
    return reply.sendFile('svg_logo.svg', path.join(process.cwd(), 'public', 'images'))
  })

  // XML
  fastify.get('/xml', async (request, reply) => {
    reply.header(constants.HTTPHeaderContentType, mime.types.xml)
    return reply.sendFile('sample.xml')
  })

  // Robots.txt
  fastify.get('/robots.txt', async (request, reply) => {
    reply.header(constants.HTTPHeaderContentType, mime.types.txt)
    return reply.sendFile('robots.txt')
  })

  // Deny
  fastify.get('/deny', async (request, reply) => {
    const text = `
          .-''''''-.
        .' _      _ '.
       /   O      O   \\
      :                :
      |                |
      :       __       :
       \\  .-"\`  \`"-.  /
        '.          .'
          '-......-'
     YOU SHOULDN'T BE HERE
  `
    reply.header(constants.HTTPHeaderContentType, mime.types.txt)
    return reply.send(text)
  })

  // HTML
  fastify.get('/html', async (request, reply) => {
    reply.header(constants.HTTPHeaderContentType, mime.types.html)
    return reply.sendFile('moby.html')
  })

  // Links
  const linksHandler = async (request, reply) => {
    let n = _.toInteger(request.params.n)
    if (!_.inRange(n, 0, 200)) {
      n = 10
    }

    let offset = request.params.offset
    if (_.isUndefined(offset)) {
      return reply.redirect(`/links/${n}/0`)
    }

    offset = _.toInteger(offset)

    const result = []
    for (let i = 0; i < n; i++) {
      if (i === offset) {
        result.push(`${i}`)
      } else {
        result.push(`<a href='/links/${n}/${i}'>${i}</a>`)
      }
    }

    reply.header(constants.HTTPHeaderContentType, mime.types.html)
    return reply.send([
      '<html><head><title>Links</title></head><body>',
      result.join(' '),
      '</body></html>'
    ].join(''))
  }

  fastify.get('/links/:n', linksHandler)
  fastify.get('/links/:n/:offset', linksHandler)

  // ETag
  fastify.get('/etag/:etag', async (request, reply) => {
    const etag = request.params.etag

    const ifMatch = request.headers[constants.HTTPHeaderIfMatch.toLowerCase()]
    if (ifMatch) {
      const matches = ifMatch.split(',')
      if (!matches.includes(etag) && !matches.includes('*')) {
        return reply.code(412).send()
      }
    }

    reply.header(constants.HTTPHeaderETag, etag)

    let status = 200

    const ifNoneMatch = request.headers[constants.HTTPHeaderIfNoneMatch.toLowerCase()]
    if (ifNoneMatch) {
      const matches = ifNoneMatch.split(',')
      if (matches.includes(etag) || matches.includes('*')) {
        status = 304
      }
    }

    return reply.code(status).send({
      args: request.ctx.query,
      headers: request.ctx.headers,
      origin: request.ctx.ip,
      url: request.ctx.url
    })
  })

  // Cache
  fastify.get('/cache', async (request, reply) => {
    const ifModifiedSince = request.headers[constants.HTTPHeaderIfModifiedSince.toLowerCase()]
    const ifNoneMatch = request.headers[constants.HTTPHeaderIfNoneMatch.toLowerCase()]

    if (ifModifiedSince || ifNoneMatch) {
      return reply.code(304).send()
    }

    const now = new Date()
    reply.header(constants.HTTPHeaderLastModified, now.toGMTString())
    reply.header(constants.HTTPHeaderETag, uuid())
    return {
      args: request.ctx.query,
      headers: request.ctx.headers,
      origin: request.ctx.ip,
      url: request.ctx.url
    }
  })

  fastify.get('/cache/:value', async (request, reply) => {
    const value = request.params.value

    const cacheControl = `public, max-age=${_.toInteger(value)}`
    reply.header(constants.HTTPHeaderCacheControl, cacheControl)
    return {
      args: request.ctx.query,
      headers: request.ctx.headers,
      origin: request.ctx.ip,
      url: request.ctx.url
    }
  })

  // Delay
  fastify.get('/delay/:delay', async (request, reply) => {
    let delay = _.toInteger(request.params.delay)
    delay = _.min([delay, 10])

    await new Promise(resolve => setTimeout(resolve, delay * 1000))

    return {
      args: request.ctx.query,
      data: request.ctx.text,
      files: request.ctx.files,
      form: request.ctx.form,
      headers: request.ctx.headers,
      json: request.ctx.body,
      origin: request.ctx.ip,
      url: request.ctx.url
    }
  })

  // Stream
  fastify.get('/stream/:n', async (request, reply) => {
    const n = toInt(request.params.n, {
      min: 0,
      max: 100
    })

    reply.header('content-type', 'application/json')

    for (let i = 0; i < n; i++) {
      reply.raw.write(JSON.stringify({
        args: request.ctx.query,
        headers: request.ctx.headers,
        origin: request.ctx.ip,
        url: request.ctx.url
      }))
      reply.raw.write('\n')
    }
    reply.raw.end()
    return reply
  })

  // Bytes
  fastify.get('/bytes/:n', async (request, reply) => {
    const n = toInt(request.params.n, {
      min: 0,
      max: 100 * 1024
    })

    reply.header(constants.HTTPHeaderContentType, mime.types.bin)
    return reply.send(crypto.randomBytes(n))
  })

  // Stream bytes
  fastify.get('/stream-bytes/:n', async (request, reply) => {
    const n = toInt(request.params.n, {
      min: 0,
      max: 100 * 1024
    })

    reply.header(constants.HTTPHeaderContentType, mime.types.bin)

    const chunkSize = _.toInteger(request.ctx.query.chunk_size) || 10 * 1024
    for (let i = 0; i < chunkSize; i++) {
      reply.raw.write(crypto.randomBytes(n))
    }
    reply.raw.end()
    return reply
  })

  // Basic auth
  fastify.get('/basic-auth/:user/:passwd', async (request, reply) => {
    const user = request.params.user
    const passwd = request.params.passwd

    const credentials = basicAuth(request.raw)

    if (!credentials || credentials.name !== user || credentials.pass !== passwd) {
      reply.header('WWW-Authenticate', 'Basic realm="Fake Realm"')
      return reply.code(401).send()
    } else {
      return {
        user,
        authenticated: true
      }
    }
  })

  // Hidden basic auth
  fastify.get('/hidden-basic-auth/:user/:passwd', async (request, reply) => {
    const user = request.params.user
    const passwd = request.params.passwd

    const credentials = basicAuth(request.raw)

    if (!credentials || credentials.name !== user || credentials.pass !== passwd) {
      return reply.code(404).send()
    } else {
      return {
        user,
        authenticated: true
      }
    }
  })

  // Forms
  fastify.get('/forms/post', async (request, reply) => {
    reply.header(constants.HTTPHeaderContentType, mime.types.html)
    return reply.sendFile('forms-post.html')
  })
}

module.exports = routes
