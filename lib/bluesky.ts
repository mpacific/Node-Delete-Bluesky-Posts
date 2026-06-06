import { AtUri, BskyAgent, AppBskyFeedDefs } from '@atproto/api'

type FeedViewPost = AppBskyFeedDefs.FeedViewPost
type Headers = Record<string, string | undefined>

interface PostRecord {
  text?: string
  createdAt?: string
}

interface FeedPage {
  headers: Headers
  data: {
    feed: FeedViewPost[]
    cursor?: string
  }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

// Verbose diagnostics, enabled with BLUESKY_DEBUG=true. They go to stderr so
// they don't pollute the normal stdout output (or the bot log file, which only
// redirects stdout).
const debug = (msg: string): void => {
  if (process.env.BLUESKY_DEBUG !== 'true') {
    return
  }
  console.error(`[bsky ${new Date().toISOString()}] ${msg}`)
}

const recordOf = (post: FeedViewPost): PostRecord =>
  post.post.record as PostRecord

export default class Bluesky {
  #agent: BskyAgent | null = null
  #rateLimit = -1
  #cursor: string | undefined = undefined

  #login = async function (this: Bluesky): Promise<void> {
    if (this.#agent) {
      debug('login: reusing existing authenticated agent')
      return
    }

    debug('login: creating BskyAgent for https://bsky.social')
    this.#agent = new BskyAgent({
      service: 'https://bsky.social',
    })

    debug(`login: authenticating as "${process.env.BLUESKY_USERNAME}"...`)
    await this.#agent.login({
      identifier: process.env.BLUESKY_USERNAME as string,
      password: process.env.BLUESKY_APP_PASSWORD as string,
    })
    debug('login: authentication succeeded')
  }

  // We can keep deleting while the limit is unknown (-1) or we still have budget.
  #hasBudget = function (this: Bluesky): boolean {
    return this.#rateLimit === -1 || this.#rateLimit > 0
  }

  // Reads always report the current budget; a missing header means "unknown".
  #trackRead = function (this: Bluesky, headers: Headers): void {
    const remaining = parseInt(headers['ratelimit-remaining'] ?? '', 10)
    this.#rateLimit = Number.isNaN(remaining) ? -1 : remaining
  }

  // Writes report the budget too; fall back to a local decrement if absent.
  #trackWrite = function (this: Bluesky, headers: Headers): void {
    const remaining = parseInt(headers['ratelimit-remaining'] ?? '', 10)
    if (!Number.isNaN(remaining)) {
      this.#rateLimit = remaining
    } else if (this.#rateLimit > 0) {
      this.#rateLimit -= 1
    }
  }

  #isExpired = function (
    this: Bluesky,
    post: FeedViewPost,
    maxDays: number,
  ): boolean {
    const createdAt = recordOf(post).createdAt
    if (!createdAt) {
      return false
    }

    const createdMs = Date.parse(createdAt)
    if (Number.isNaN(createdMs)) {
      return false
    }

    return createdMs < Date.now() - maxDays * MS_PER_DAY
  }

  #deleteRecord = async function (this: Bluesky, uri: string): Promise<void> {
    const aturi = new AtUri(uri)
    debug(
      `deleteRecord: sending delete for ${aturi.collection}/${aturi.rkey} (repo ${aturi.hostname})`,
    )
    const response = await this.#agent!.com.atproto.repo.deleteRecord({
      repo: aturi.hostname,
      collection: aturi.collection,
      rkey: aturi.rkey,
    })
    this.#trackWrite(response.headers)
    debug(`deleteRecord: done; rate-limit budget now ${this.#rateLimit}`)
  }

  // Paginates a feed and deletes expired items one page at a time, so we never
  // hold the whole feed in memory. `selectUri` returns the record to delete for
  // a given feed item (the post itself, the repost, or the like).
  #purge = async function (
    this: Bluesky,
    fetchPage: (cursor?: string) => Promise<FeedPage>,
    maxDays: number,
    selectUri: (post: FeedViewPost) => string | undefined,
  ): Promise<number> {
    this.#cursor = undefined
    this.#rateLimit = -1
    let deleted = 0
    let fetchMore = true
    let iteration = 0

    while (fetchMore) {
      iteration += 1
      debug(
        `purge: --- page ${iteration} --- cursor=${this.#cursor ?? '<none>'} budget=${this.#rateLimit}`,
      )

      if (!this.#hasBudget()) {
        throw new Error('Rate limit exceeded!')
      }

      debug('purge: fetching page...')
      const response = await fetchPage(this.#cursor || undefined)
      this.#trackRead(response.headers)
      const feed = response?.data?.feed ?? []
      this.#cursor = response?.data?.cursor
      debug(
        `purge: page ${iteration} returned ${feed.length} item(s); ` +
          `next cursor=${this.#cursor ?? '<none>'}; ` +
          `ratelimit-remaining header=${response.headers['ratelimit-remaining'] ?? '<missing>'}`,
      )

      let deletedThisPage = 0
      for (const post of feed) {
        if (!this.#isExpired(post, maxDays)) {
          continue
        }

        if (!this.#hasBudget()) {
          throw new Error('Rate limit exceeded!')
        }

        const uri = selectUri(post)
        if (!uri) {
          debug('purge: expired item had no deletable uri; skipping')
          continue
        }

        console.log(`Deleting ${uri} (created ${recordOf(post).createdAt})`)
        await this.#deleteRecord(uri)
        deleted += 1
        deletedThisPage += 1
      }

      // Stop when there is no cursor OR the page came back empty. Bluesky
      // (notably getActorLikes) can keep returning a cursor on the trailing
      // empty page, so relying on the cursor alone loops forever.
      fetchMore = !!this.#cursor && feed.length > 0
      debug(
        `purge: page ${iteration} complete; deleted ${deletedThisPage} this page, ${deleted} total; fetchMore=${fetchMore}`,
      )
    }

    debug(
      `purge: finished after ${iteration} page(s); deleted ${deleted} total`,
    )
    return deleted
  }

  deletePosts = async function (this: Bluesky): Promise<void> {
    console.log(`Starting to delete posts`)
    if (!process.env.POST_MAX_DAYS) {
      throw new Error('POST_MAX_DAYS is not defined!')
    }
    await this.#login()

    const deleted = await this.#purge(
      (cursor) =>
        this.#agent!.getAuthorFeed({
          actor: process.env.BLUESKY_USERNAME as string,
          cursor,
          includePins: false,
          limit: 100,
        }),
      Number(process.env.POST_MAX_DAYS),
      (post) =>
        post?.reason?.$type === 'app.bsky.feed.defs#reasonRepost'
          ? post.post.viewer?.repost
          : post.post.uri,
    )

    console.log(`Finished deleting posts. Deleted ${deleted} post(s).`)
  }

  deleteLikes = async function (this: Bluesky): Promise<void> {
    console.log(`Starting to delete likes`)
    if (!process.env.LIKE_MAX_DAYS) {
      throw new Error('LIKE_MAX_DAYS is not defined!')
    }
    await this.#login()

    const deleted = await this.#purge(
      (cursor) =>
        this.#agent!.app.bsky.feed.getActorLikes({
          actor: process.env.BLUESKY_USERNAME as string,
          cursor,
          limit: 100,
        }),
      Number(process.env.LIKE_MAX_DAYS),
      (post) => post.post.viewer?.like,
    )

    console.log(`Finished deleting likes. Deleted ${deleted} like(s).`)
  }
}
