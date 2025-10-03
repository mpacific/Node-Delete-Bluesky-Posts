const { BskyAgent } = require('@atproto/api')
const Moment = require('moment-timezone')

module.exports = class {
  #agent = null
  #rateLimit = -1
  #cursor = null

  #login = async function () {
    if (this.#agent) {
      return this.#agent
    }

    this.#agent = new BskyAgent({
      service: 'https://bsky.social',
    })

    await this.#agent.login({
      identifier: process.env.BLUESKY_USERNAME,
      password: process.env.BLUESKY_APP_PASSWORD,
    })
  }

  #getAllPosts = async function () {
    this.#cursor = undefined
    let allPosts = []
    const limit = 100
    let fetchMore = true

    while (fetchMore) {
      if (this.#rateLimit === -1 || this.#rateLimit > 0) {
        const response = await this.#agent.getAuthorFeed({
          actor: process.env.BLUESKY_USERNAME,
          cursor: this.#cursor || undefined,
          includePins: false,
          limit,
        })

        this.#rateLimit = parseInt(response.headers['ratelimit-remaining'])
        this.#cursor = response?.data?.cursor

        if (this.#cursor && response?.data?.feed?.length) {
          allPosts = allPosts.concat(response.data.feed)
        } else {
          fetchMore = false
        }
      } else {
        throw new Error('Rate limit exceeded!')
      }
    }

    return allPosts
  }

  #getAllLikes = async function () {
    this.#cursor = undefined
    let allLikes = []
    const limit = 100
    let fetchMore = true

    while (fetchMore) {
      if (this.#rateLimit === -1 || this.#rateLimit > 0) {
        const response = await this.#agent.app.bsky.feed.getActorLikes({
          actor: process.env.BLUESKY_USERNAME,
          cursor: this.#cursor || undefined,
          limit,
        })

        this.#rateLimit = parseInt(response.headers['ratelimit-remaining'])
        this.#cursor = response?.data?.cursor

        if (this.#cursor && response?.data?.feed?.length) {
          allLikes = allLikes.concat(response.data.feed)
        } else {
          fetchMore = false
        }
      } else {
        throw new Error('Rate limit exceeded!')
      }
    }

    return allLikes
  }

  #getOldPosts = async function (allPosts, maxDays) {
    const postsToDelete = []
    const minDate = Moment().subtract(maxDays, 'days')

    if (allPosts?.length) {
      for (const post of allPosts) {
        const postDate = Moment(post.post.record.createdAt)
        if (postDate < minDate) {
          postsToDelete.push(post)
        }
      }
    }

    return postsToDelete
  }

  #deleteOldPosts = async function (postsToDelete) {
    console.log(`Deleting ${postsToDelete.length} posts.`)

    for (const postToDelete of postsToDelete) {
      if (this.#rateLimit === -1 || this.#rateLimit > 0) {
        console.log(
          `Deleting: ${postToDelete.post.record.text} (Created ${postToDelete.post.record.createdAt})`,
        )

        if (postToDelete?.reason?.$type === 'app.bsky.feed.defs#reasonRepost') {
          await this.#agent.deleteRepost(postToDelete.post.viewer.repost)
        } else {
          await this.#agent.deletePost(postToDelete.post.uri)
        }
        console.log(
          `Deleted: ${postToDelete.post.record.text} (Created ${postToDelete.post.record.createdAt})`,
        )

        if (this.#rateLimit > 0) {
          this.#rateLimit = this.#rateLimit - 1
        }
      } else {
        throw new Error('Rate limit exceeded!')
      }
    }
  }

  #deleteOldLikes = async function (likesToDelete) {
    console.log(`Deleting ${likesToDelete.length} likes.`)

    for (const likeToDelete of likesToDelete) {
      if (this.#rateLimit === -1 || this.#rateLimit > 0) {
        console.log(
          `Deleting: ${likeToDelete.post.record.text} (Created ${likeToDelete.post.record.createdAt})`,
        )

        await this.#agent.deleteLike(likeToDelete.post.viewer.like)
        console.log(
          `Deleted: ${likeToDelete.post.record.text} (Created ${likeToDelete.post.record.createdAt})`,
        )

        if (this.#rateLimit > 0) {
          this.#rateLimit = this.#rateLimit - 1
        }
      } else {
        throw new Error('Rate limit exceeded!')
      }
    }
  }

  deletePosts = async function () {
    console.log(`Starting to delete posts`)
    if (!process.env.POST_MAX_DAYS) {
      throw new Error('POST_MAX_DAYS is not defined!')
    }
    await this.#login()

    const posts = await this.#getAllPosts()
    const postsToDelete = await this.#getOldPosts(
      posts,
      process.env.POST_MAX_DAYS,
    )
    await this.#deleteOldPosts(postsToDelete)

    console.log(`Finished deleting posts`)
  }

  deleteLikes = async function () {
    console.log(`Starting to delete likes`)
    if (!process.env.LIKE_MAX_DAYS) {
      throw new Error('LIKE_MAX_DAYS is not defined!')
    }
    await this.#login()

    const likes = await this.#getAllLikes()
    const likesToDelete = await this.#getOldPosts(
      likes,
      process.env.LIKE_MAX_DAYS,
    )
    await this.#deleteOldLikes(likesToDelete)

    console.log(`Finished deleting likes`)
  }
}
