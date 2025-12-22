const config = require('config')
const request = require('supertest')
const assert = require('power-assert')
const app = require('../app/app')

describe('cors', () => {
  it('should ok if from trusted domains', async function () {
    const originHost = 'http://a.com'
    const res = await request(app)
      .get('/version')
      .set('origin', originHost)

    assert(res.headers['access-control-allow-origin'] === originHost)
  })

  it('should fail if from trusted domains', async function () {
    const originHost = 'http://b.com'
    const res = await request(app)
      .get('/version')
      .set('origin', originHost)

    assert(res.headers['access-control-allow-origin'] === undefined)
  })

  it('should fail if invalid config', async function () {
    const configCORS = config.cors
    config.cors = ['[(']
    const originHost = 'http://b.com'
    const res = await request(app)
      .get('/version')
      .set('origin', originHost)
    assert(res.statusCode === 500)
    config.cors = configCORS
  })
})
