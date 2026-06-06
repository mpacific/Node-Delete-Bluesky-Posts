import 'dotenv/config'
import Bluesky from './lib/bluesky'

// Verbose diagnostics, enabled with BLUESKY_DEBUG=true (see lib/bluesky.ts).
const log = (msg: string): void => {
  if (process.env.BLUESKY_DEBUG !== 'true') {
    return
  }
  console.error(`[bsky ${new Date().toISOString()}] index: ${msg}`)
}

const runScript = async function (): Promise<void> {
  log('runScript: start')
  const bsky = new Bluesky()

  if (process.env.BLUESKY_DELETE_POSTS === 'true') {
    log('runScript: BLUESKY_DELETE_POSTS=true -> deleting posts')
    await bsky.deletePosts()
    log('runScript: deletePosts returned')
  } else {
    log('runScript: BLUESKY_DELETE_POSTS is not "true" -> skipping posts')
  }

  if (process.env.BLUESKY_DELETE_LIKES === 'true') {
    log('runScript: BLUESKY_DELETE_LIKES=true -> deleting likes')
    await bsky.deleteLikes()
    log('runScript: deleteLikes returned')
  } else {
    log('runScript: BLUESKY_DELETE_LIKES is not "true" -> skipping likes')
  }

  log('runScript: all work finished')
}

runScript()
  .then(() => {
    log('runScript resolved cleanly')
    // If the work is done but the process still hangs, something is keeping the
    // event loop alive. Dump whatever that is so it can be identified.
    const proc = process as unknown as {
      _getActiveHandles?: () => unknown[]
      _getActiveRequests?: () => unknown[]
    }
    const handles = proc._getActiveHandles?.() ?? []
    const requests = proc._getActiveRequests?.() ?? []
    log(
      `event loop status: ${handles.length} active handle(s), ${requests.length} active request(s)`,
    )
    for (const handle of handles) {
      const name =
        (handle as { constructor?: { name?: string } })?.constructor?.name ??
        typeof handle
      log(`  active handle: ${name}`)
    }
    if (handles.length > 0 || requests.length > 0) {
      log(
        'the process will not exit until the above are closed (likely open ' +
          'sockets from the HTTP client); if it never exits, that is why',
      )
    } else {
      log('nothing is keeping the loop alive; the process should exit now')
    }
  })
  .catch((err: unknown) => {
    log(
      `runScript rejected: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
    )
    process.exitCode = 1
  })
