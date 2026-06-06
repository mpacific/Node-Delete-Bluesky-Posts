import Assert from 'assert'
import Sinon from 'sinon'
import proxyquire from 'proxyquire'

// runScript() runs on import as a fire-and-forget promise; flush microtasks so
// the stubbed deletePosts/deleteLikes have resolved before we assert.
const flush = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve))

describe('index entry point', function () {
  let deletePosts: Sinon.SinonStub
  let deleteLikes: Sinon.SinonStub

  beforeEach(function () {
    deletePosts = Sinon.stub().resolves()
    deleteLikes = Sinon.stub().resolves()
    process.env.BLUESKY_DEBUG = 'true' // exercise the diagnostic paths
    Sinon.stub(console, 'log')
    Sinon.stub(console, 'error') // swallow verbose stderr diagnostics
  })

  afterEach(function () {
    Sinon.restore()
    delete process.env.BLUESKY_DELETE_POSTS
    delete process.env.BLUESKY_DELETE_LIKES
    delete process.env.BLUESKY_DEBUG
  })

  const run = async (): Promise<void> => {
    const BlueskyStub = class {
      deletePosts = deletePosts
      deleteLikes = deleteLikes
    }
    proxyquire('../index', {
      'dotenv/config': { '@noCallThru': true },
      './lib/bluesky': {
        default: BlueskyStub,
        __esModule: true,
        '@noCallThru': true,
      },
    })
    await flush()
  }

  it('deletes both posts and likes when both flags are true', async function () {
    process.env.BLUESKY_DELETE_POSTS = 'true'
    process.env.BLUESKY_DELETE_LIKES = 'true'

    await run()

    Assert.equal(deletePosts.calledOnce, true)
    Assert.equal(deleteLikes.calledOnce, true)
  })

  it('deletes only posts when only the posts flag is true', async function () {
    process.env.BLUESKY_DELETE_POSTS = 'true'
    process.env.BLUESKY_DELETE_LIKES = 'false'

    await run()

    Assert.equal(deletePosts.calledOnce, true)
    Assert.equal(deleteLikes.called, false)
  })

  it('does nothing when both flags are off (and stays silent without BLUESKY_DEBUG)', async function () {
    process.env.BLUESKY_DELETE_POSTS = 'false'
    process.env.BLUESKY_DELETE_LIKES = 'false'
    delete process.env.BLUESKY_DEBUG
    const consoleErrorStub = console.error as Sinon.SinonStub

    await run()

    Assert.equal(deletePosts.called, false)
    Assert.equal(deleteLikes.called, false)
    Assert.equal(consoleErrorStub.called, false)
  })
})
