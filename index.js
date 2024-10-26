require('dotenv').config()
const Bluesky = require('./lib/bluesky')

const runScript = async function () {
  const bsky = new Bluesky()

  if (process.env.BLUESKY_DELETE_POSTS === 'true') {
    await bsky.deletePosts()
  }

  if (process.env.BLUESKY_DELETE_LIKES === 'true') {
    await bsky.deleteLikes()
  }
}

runScript()
