const Assert = require('assert')
const Sinon = require('sinon')
const Moment = require('moment-timezone')
const proxyquire = require('proxyquire')

describe('bluesky library', function () {
  let Bluesky,
    loginStub,
    getAuthorFeedData1,
    getAuthorFeedData2,
    getAuthorFeedData3,
    getAuthorFeedStub,
    getActorLikesData,
    getActorLikesStub,
    deleteRepostStub,
    deletePostStub,
    deleteLikeStub,
    consoleLogStub,
    classUnderTest

  describe('deletePosts', function () {
    describe('deletes two posts and one repost', function () {
      before(async function () {
        process.env.BLUESKY_USERNAME = 'foo.bsky.social'
        process.env.BLUESKY_APP_PASSWORD = 'foo123'
        process.env.BLUESKY_DELETE_POSTS = 'true'
        process.env.POST_MAX_DAYS = '60'
        process.env.BLUESKY_DELETE_LIKES = 'true'
        process.env.LIKE_MAX_DAYS = '60'

        loginStub = Sinon.stub().resolves()

        getAuthorFeedData1 = {
          data: {
            feed: [],
            cursor: undefined,
          },
          headers: {
            'ratelimit-remaining': '2996',
          },
        }
        getAuthorFeedData2 = {
          data: {
            feed: [
              {
                post: {
                  uri: '209238903',
                  record: {
                    text: 'foo test',
                    createdAt: Moment().subtract(3, 'months').format(),
                  },
                },
              },
              {
                post: {
                  uri: '2302923',
                  record: {
                    text: 'foo test 2',
                    createdAt: Moment().subtract(1, 'months').format(),
                  },
                },
              },
            ],
            cursor: '98askjdas7',
          },
          headers: {
            'ratelimit-remaining': '2995',
          },
        }
        getAuthorFeedData3 = {
          data: {
            feed: [
              {
                post: {
                  uri: '239082890',
                  record: {
                    text: 'foo test 3',
                    createdAt: Moment().subtract(6, 'months').format(),
                  },
                },
              },
              {
                post: {
                  record: {
                    text: 'foo test 4',
                    createdAt: Moment().subtract(6, 'months').format(),
                  },
                  viewer: {
                    repost: '9283083209',
                  },
                },
                reason: {
                  $type: 'app.bsky.feed.defs#reasonRepost',
                },
              },
            ],
            cursor: '98askljd',
          },
          headers: {
            'ratelimit-remaining': '2994',
          },
        }
        getAuthorFeedStub = Sinon.stub().resolves(getAuthorFeedData1)
        getAuthorFeedStub.onFirstCall().resolves(getAuthorFeedData2)
        getAuthorFeedStub.onSecondCall().resolves(getAuthorFeedData3)

        getActorLikesData = {
          data: {
            feed: [],
            cursor: undefined,
          },
          headers: {},
        }
        getActorLikesStub = Sinon.stub().resolves(getActorLikesData)

        deleteLikeStub = Sinon.stub().resolves()
        deletePostStub = Sinon.stub().resolves()
        deleteRepostStub = Sinon.stub().resolves()

        consoleLogStub = Sinon.stub(console, 'log')

        const atProto = {
          BskyAgent: Sinon.stub().returns({
            login: loginStub,
            getAuthorFeed: getAuthorFeedStub,
            app: {
              bsky: {
                feed: {
                  getActorLikes: getActorLikesStub,
                },
              },
            },
            deleteLike: deleteLikeStub,
            deletePost: deletePostStub,
            deleteRepost: deleteRepostStub,
          }),
        }

        Bluesky = proxyquire('../../lib/bluesky', {
          '@atproto/api': atProto,
        })

        classUnderTest = new Bluesky()
        await classUnderTest.deletePosts()
      })

      after(function () {
        Sinon.restore()
      })

      it('console.log is called', async function () {
        Assert.equal(consoleLogStub.callCount, 9)
        console.error(consoleLogStub.args)
      })

      it('successfully calls login', async function () {
        Assert.equal(loginStub.calledOnce, true)
      })

      it('calls getAuthorFeed three times', async function () {
        Assert.equal(getAuthorFeedStub.callCount, 3)
      })

      it('calls deletePost twice', async function () {
        Assert.equal(deletePostStub.calledTwice, true)
      })

      it('calls deleteRepost once', async function () {
        Assert.equal(deleteRepostStub.calledOnce, true)
      })

      it('does not call getActorLikes', async function () {
        Assert.equal(getActorLikesStub.called, false)
      })

      it('does not call deleteLike', async function () {
        Assert.equal(deleteLikeStub.called, false)
      })
    })
  })

  describe('deleteLikes', function () {})
})
