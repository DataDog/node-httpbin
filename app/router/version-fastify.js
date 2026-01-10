const pkg = require('../../package')

async function routes (fastify, options) {
  fastify.get('/version', async (request, reply) => {
    return {
      name: pkg.name,
      version: pkg.version,
      author: pkg.author,
      license: pkg.license
    }
  })
}

module.exports = routes
