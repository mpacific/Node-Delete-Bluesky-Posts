require('dotenv').config()
const Bluesky = require('./lib/bluesky')

const runScript = async function () {
  if (process.env.BLUESKY_DELETE_POSTS === 'true') {
    await Bluesky.deletePosts()
  }

  if (process.env.BLUESKY_DELETE_LIKES === 'true') {
    await Bluesky.deleteLikes()
  }
}

runScript()
