const _ = require('lodash')
const config = require('config')

const logger = require('pino')({
  base: null,
  level: _.get(config, 'logger.level')
})

module.exports = logger
