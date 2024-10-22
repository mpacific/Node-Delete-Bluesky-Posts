require('dotenv').config()
const Bluesky = require('./lib/bluesky')
const _ = require('lodash')
const Moment = require('moment-timezone')

if (process.env.BLUESKY_DELETE_POSTS === 'true') {
}

if (process.env.BLUESKY_DELETE_REPOSTS === 'true') {
}

if (process.env.BLUESKY_DELETE_LIKES === 'true') {
}
