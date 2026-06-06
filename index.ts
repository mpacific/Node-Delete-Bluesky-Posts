import 'dotenv/config'
import Bluesky from './lib/bluesky'

const runScript = async function (): Promise<void> {
  const bsky = new Bluesky()

  if (process.env.BLUESKY_DELETE_POSTS === 'true') {
    await bsky.deletePosts()
  }

  if (process.env.BLUESKY_DELETE_LIKES === 'true') {
    await bsky.deleteLikes()
  }
}

runScript()
