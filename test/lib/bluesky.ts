import Assert from 'assert'
import Sinon from 'sinon'
import proxyquire from 'proxyquire'
import type Bluesky from '../../lib/bluesky'

interface FeedItem {
  post: {
    uri: string
    record: { text?: string; createdAt?: string }
    viewer?: { repost?: string; like?: string }
  }
  reason?: { $type: string }
}

interface Page {
  headers: Record<string, string>
  data: { feed: FeedItem[]; cursor?: string }
}

const daysAgo = (n: number): string =>
  new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()

const page = (
  feed: FeedItem[],
  cursor: string | undefined,
  remaining: string | null = '3000',
): Page => ({
  headers: remaining === null ? {} : { 'ratelimit-remaining': remaining },
  data: { feed, cursor },
})

// Load lib/bluesky with a stubbed BskyAgent. AtUri is left untouched (proxyquire
// calls through to the real export), so it parses the AT URIs in the test data.
const loadBluesky = (agent: object): typeof Bluesky => {
  const atproto = { BskyAgent: Sinon.stub().returns(agent) }
  return proxyquire('../../lib/bluesky', { '@atproto/api': atproto })
    .default as typeof Bluesky
}

describe('bluesky library', function () {
  let consoleLogStub: Sinon.SinonStub

  beforeEach(function () {
    process.env.BLUESKY_USERNAME = 'foo.bsky.social'
    process.env.BLUESKY_APP_PASSWORD = 'foo123'
    process.env.POST_MAX_DAYS = '60'
    process.env.LIKE_MAX_DAYS = '60'
    process.env.BLUESKY_DEBUG = 'true' // exercise the diagnostic paths
    consoleLogStub = Sinon.stub(console, 'log')
    Sinon.stub(console, 'error') // swallow verbose stderr diagnostics
  })

  afterEach(function () {
    Sinon.restore()
  })

  describe('deletePosts', function () {
    it('deletes expired posts and reposts across pages, skipping recent ones', async function () {
      const loginStub = Sinon.stub().resolves()
      const getAuthorFeedStub = Sinon.stub()
      getAuthorFeedStub.onFirstCall().resolves(
        page(
          [
            {
              post: {
                uri: 'at://did:plc:foo/app.bsky.feed.post/expired1',
                record: { text: 'PRIVATE_TEXT', createdAt: daysAgo(90) },
              },
            },
            {
              post: {
                uri: 'at://did:plc:foo/app.bsky.feed.post/recent',
                record: { text: 'PRIVATE_TEXT', createdAt: daysAgo(10) },
              },
            },
          ],
          'cursor1',
        ),
      )
      getAuthorFeedStub.onSecondCall().resolves(
        page(
          [
            {
              post: {
                uri: 'at://did:plc:foo/app.bsky.feed.post/expired2',
                record: { text: 'PRIVATE_TEXT', createdAt: daysAgo(120) },
              },
            },
            {
              post: {
                uri: 'at://did:plc:foo/app.bsky.feed.post/reposted',
                record: { text: 'PRIVATE_TEXT', createdAt: daysAgo(200) },
                viewer: {
                  repost: 'at://did:plc:foo/app.bsky.feed.repost/myrepost',
                },
              },
              reason: { $type: 'app.bsky.feed.defs#reasonRepost' },
            },
          ],
          'cursor2',
        ),
      )
      getAuthorFeedStub.resolves(page([], undefined))

      const getActorLikesStub = Sinon.stub().resolves(page([], undefined))
      const deleteRecordStub = Sinon.stub().resolves(page([], undefined))

      const Bluesky = loadBluesky({
        login: loginStub,
        getAuthorFeed: getAuthorFeedStub,
        app: { bsky: { feed: { getActorLikes: getActorLikesStub } } },
        com: { atproto: { repo: { deleteRecord: deleteRecordStub } } },
      })

      await new Bluesky().deletePosts()

      Assert.equal(loginStub.calledOnce, true)
      Assert.equal(getAuthorFeedStub.callCount, 3)
      Assert.equal(getActorLikesStub.called, false)
      Assert.equal(deleteRecordStub.callCount, 3)

      // Two posts deleted from the post collection, one from the repost collection.
      Assert.equal(
        deleteRecordStub.getCall(0).args[0].collection,
        'app.bsky.feed.post',
      )
      Assert.equal(deleteRecordStub.getCall(0).args[0].rkey, 'expired1')
      Assert.equal(
        deleteRecordStub.getCall(1).args[0].collection,
        'app.bsky.feed.post',
      )
      Assert.equal(
        deleteRecordStub.getCall(2).args[0].collection,
        'app.bsky.feed.repost',
      )
      Assert.equal(deleteRecordStub.getCall(2).args[0].rkey, 'myrepost')

      // Start + 3 deletions + finish; no post text is logged.
      Assert.equal(consoleLogStub.callCount, 5)
      Assert.equal(
        consoleLogStub.lastCall.args[0],
        'Finished deleting posts. Deleted 3 post(s).',
      )
      const logsPostText = consoleLogStub
        .getCalls()
        .some((c) => String(c.args[0]).includes('PRIVATE_TEXT'))
      Assert.equal(logsPostText, false)
    })

    it('handles a page with no feed array', async function () {
      const getAuthorFeedStub = Sinon.stub().resolves({
        headers: { 'ratelimit-remaining': '3000' },
        data: { cursor: undefined },
      })
      const deleteRecordStub = Sinon.stub()

      const Bluesky = loadBluesky({
        login: Sinon.stub().resolves(),
        getAuthorFeed: getAuthorFeedStub,
        com: { atproto: { repo: { deleteRecord: deleteRecordStub } } },
      })

      await new Bluesky().deletePosts()

      Assert.equal(getAuthorFeedStub.callCount, 1)
      Assert.equal(deleteRecordStub.called, false)
    })

    it('throws when POST_MAX_DAYS is not defined', async function () {
      delete process.env.POST_MAX_DAYS
      const Bluesky = loadBluesky({ login: Sinon.stub().resolves() })

      await Assert.rejects(
        () => new Bluesky().deletePosts(),
        /POST_MAX_DAYS is not defined/,
      )
    })

    it('skips posts with missing or unparseable createdAt', async function () {
      const getAuthorFeedStub = Sinon.stub().resolves(
        page(
          [
            {
              post: {
                uri: 'at://did:plc:foo/app.bsky.feed.post/nodate',
                record: { text: 'no date' },
              },
            },
            {
              post: {
                uri: 'at://did:plc:foo/app.bsky.feed.post/baddate',
                record: { text: 'bad', createdAt: 'not-a-date' },
              },
            },
            {
              post: {
                uri: 'at://did:plc:foo/app.bsky.feed.post/expired',
                record: { text: 'old', createdAt: daysAgo(90) },
              },
            },
          ],
          undefined,
        ),
      )
      const deleteRecordStub = Sinon.stub().resolves(page([], undefined))

      const Bluesky = loadBluesky({
        login: Sinon.stub().resolves(),
        getAuthorFeed: getAuthorFeedStub,
        com: { atproto: { repo: { deleteRecord: deleteRecordStub } } },
      })

      await new Bluesky().deletePosts()

      Assert.equal(deleteRecordStub.callCount, 1)
      Assert.equal(deleteRecordStub.getCall(0).args[0].rkey, 'expired')
    })

    it('treats a missing rate-limit header as unknown and keeps deleting', async function () {
      const getAuthorFeedStub = Sinon.stub().resolves(
        page(
          [
            {
              post: {
                uri: 'at://did:plc:foo/app.bsky.feed.post/expired',
                record: { createdAt: daysAgo(90) },
              },
            },
          ],
          undefined,
          null, // no ratelimit-remaining header
        ),
      )
      const deleteRecordStub = Sinon.stub().resolves(page([], undefined))

      const Bluesky = loadBluesky({
        login: Sinon.stub().resolves(),
        getAuthorFeed: getAuthorFeedStub,
        com: { atproto: { repo: { deleteRecord: deleteRecordStub } } },
      })

      await new Bluesky().deletePosts()

      Assert.equal(deleteRecordStub.callCount, 1)
    })

    it('throws when the rate limit is exhausted before a delete', async function () {
      const getAuthorFeedStub = Sinon.stub().resolves(
        page(
          [
            {
              post: {
                uri: 'at://did:plc:foo/app.bsky.feed.post/expired',
                record: { createdAt: daysAgo(90) },
              },
            },
          ],
          undefined,
          '0', // no budget remaining
        ),
      )
      const deleteRecordStub = Sinon.stub().resolves(page([], undefined))

      const Bluesky = loadBluesky({
        login: Sinon.stub().resolves(),
        getAuthorFeed: getAuthorFeedStub,
        com: { atproto: { repo: { deleteRecord: deleteRecordStub } } },
      })

      await Assert.rejects(
        () => new Bluesky().deletePosts(),
        /Rate limit exceeded/,
      )
      Assert.equal(deleteRecordStub.called, false)
    })

    it('throws on the next page when the budget is exhausted', async function () {
      // A page of only recent posts (nothing to delete) with a cursor and zero
      // budget: the loop advances to a second page and the top-of-loop guard
      // throws before fetching again.
      const getAuthorFeedStub = Sinon.stub().resolves(
        page(
          [
            {
              post: {
                uri: 'at://did:plc:foo/app.bsky.feed.post/recent',
                record: { createdAt: daysAgo(5) },
              },
            },
          ],
          'cursor1',
          '0',
        ),
      )

      const deleteRecordStub = Sinon.stub()
      const Bluesky = loadBluesky({
        login: Sinon.stub().resolves(),
        getAuthorFeed: getAuthorFeedStub,
        com: { atproto: { repo: { deleteRecord: deleteRecordStub } } },
      })

      await Assert.rejects(
        () => new Bluesky().deletePosts(),
        /Rate limit exceeded/,
      )
      Assert.equal(getAuthorFeedStub.callCount, 1)
      Assert.equal(deleteRecordStub.called, false)
    })

    it('stops paginating when a page is empty even if a cursor is returned', async function () {
      // Regression: getActorLikes/getAuthorFeed can return a non-null cursor on
      // the trailing empty page. The loop must terminate instead of spinning.
      const getAuthorFeedStub = Sinon.stub().resolves(
        page([], 'this-cursor-never-goes-away'),
      )

      const Bluesky = loadBluesky({
        login: Sinon.stub().resolves(),
        getAuthorFeed: getAuthorFeedStub,
        com: { atproto: { repo: { deleteRecord: Sinon.stub() } } },
      })

      await new Bluesky().deletePosts()

      Assert.equal(getAuthorFeedStub.callCount, 1)
    })

    it('decrements the budget locally when a write omits the header', async function () {
      // Read reports budget of 1; deletes return no header. The first delete
      // succeeds and decrements to 0, so the second expired post throws.
      const getAuthorFeedStub = Sinon.stub().resolves(
        page(
          [
            {
              post: {
                uri: 'at://did:plc:foo/app.bsky.feed.post/expired1',
                record: { createdAt: daysAgo(90) },
              },
            },
            {
              post: {
                uri: 'at://did:plc:foo/app.bsky.feed.post/expired2',
                record: { createdAt: daysAgo(90) },
              },
            },
          ],
          undefined,
          '1',
        ),
      )
      const deleteRecordStub = Sinon.stub().resolves(page([], undefined, null))

      const Bluesky = loadBluesky({
        login: Sinon.stub().resolves(),
        getAuthorFeed: getAuthorFeedStub,
        com: { atproto: { repo: { deleteRecord: deleteRecordStub } } },
      })

      await Assert.rejects(
        () => new Bluesky().deletePosts(),
        /Rate limit exceeded/,
      )
      Assert.equal(deleteRecordStub.callCount, 1)
    })

    it('processes a full page then stops on a trailing empty page that still has a cursor', async function () {
      const getAuthorFeedStub = Sinon.stub()
      getAuthorFeedStub.onFirstCall().resolves(
        page(
          [
            {
              post: {
                uri: 'at://did:plc:foo/app.bsky.feed.post/expired',
                record: { createdAt: daysAgo(90) },
              },
            },
          ],
          'cursor1',
        ),
      )
      // Trailing page: empty, but the cursor never clears.
      getAuthorFeedStub.resolves(page([], 'still-here'))
      const deleteRecordStub = Sinon.stub().resolves(page([], undefined))

      const Bluesky = loadBluesky({
        login: Sinon.stub().resolves(),
        getAuthorFeed: getAuthorFeedStub,
        com: { atproto: { repo: { deleteRecord: deleteRecordStub } } },
      })

      await new Bluesky().deletePosts()

      Assert.equal(getAuthorFeedStub.callCount, 2)
      Assert.equal(deleteRecordStub.callCount, 1)
    })
  })

  describe('deleteLikes', function () {
    it('deletes expired likes and skips items without a like uri', async function () {
      const getActorLikesStub = Sinon.stub()
      getActorLikesStub.onFirstCall().resolves(
        page(
          [
            {
              post: {
                uri: 'at://did:plc:bar/app.bsky.feed.post/liked',
                record: { createdAt: daysAgo(90) },
                viewer: { like: 'at://did:plc:foo/app.bsky.feed.like/mylike' },
              },
            },
            {
              post: {
                uri: 'at://did:plc:bar/app.bsky.feed.post/recent',
                record: { createdAt: daysAgo(5) },
                viewer: { like: 'at://did:plc:foo/app.bsky.feed.like/skip' },
              },
            },
            {
              // expired but no viewer.like => selectUri returns undefined
              post: {
                uri: 'at://did:plc:bar/app.bsky.feed.post/nolike',
                record: { createdAt: daysAgo(90) },
              },
            },
          ],
          undefined,
        ),
      )
      const deleteRecordStub = Sinon.stub().resolves(page([], undefined))

      const Bluesky = loadBluesky({
        login: Sinon.stub().resolves(),
        app: { bsky: { feed: { getActorLikes: getActorLikesStub } } },
        com: { atproto: { repo: { deleteRecord: deleteRecordStub } } },
      })

      await new Bluesky().deleteLikes()

      Assert.equal(getActorLikesStub.callCount, 1)
      Assert.equal(deleteRecordStub.callCount, 1)
      Assert.equal(
        deleteRecordStub.getCall(0).args[0].collection,
        'app.bsky.feed.like',
      )
      Assert.equal(deleteRecordStub.getCall(0).args[0].rkey, 'mylike')
      Assert.equal(
        consoleLogStub.lastCall.args[0],
        'Finished deleting likes. Deleted 1 like(s).',
      )
    })

    it('throws when LIKE_MAX_DAYS is not defined', async function () {
      delete process.env.LIKE_MAX_DAYS
      const Bluesky = loadBluesky({ login: Sinon.stub().resolves() })

      await Assert.rejects(
        () => new Bluesky().deleteLikes(),
        /LIKE_MAX_DAYS is not defined/,
      )
    })
  })

  describe('diagnostics', function () {
    it('stays silent when BLUESKY_DEBUG is not set', async function () {
      delete process.env.BLUESKY_DEBUG
      const consoleErrorStub = console.error as Sinon.SinonStub

      const Bluesky = loadBluesky({
        login: Sinon.stub().resolves(),
        getAuthorFeed: Sinon.stub().resolves(page([], undefined)),
        com: { atproto: { repo: { deleteRecord: Sinon.stub() } } },
      })

      await new Bluesky().deletePosts()

      Assert.equal(consoleErrorStub.called, false)
    })
  })

  describe('login', function () {
    it('logs in only once when deleting posts then likes', async function () {
      const loginStub = Sinon.stub().resolves()
      const Bluesky = loadBluesky({
        login: loginStub,
        getAuthorFeed: Sinon.stub().resolves(page([], undefined)),
        app: {
          bsky: {
            feed: { getActorLikes: Sinon.stub().resolves(page([], undefined)) },
          },
        },
        com: { atproto: { repo: { deleteRecord: Sinon.stub() } } },
      })

      const bsky = new Bluesky()
      await bsky.deletePosts()
      await bsky.deleteLikes()

      Assert.equal(loginStub.calledOnce, true)
    })
  })
})
