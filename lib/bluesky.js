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

        this.#rateLimit = response.headers['ratelimit-remaining']

        if (response?.data?.feed?.length) {
          allPosts = allPosts.concat(response.data.feed)
          this.#cursor = response.data.cursor

          if (response.data.feed.length < limit) {
            fetchMore = false
          }
        }
      } else {
        throw new Error('Rate limit exceeded!')
      }
    }

    return allPosts
  }

  deletePosts = async function () {
    console.log(`Starting to delete posts`)
    if (!process.env.POST_MAX_DAYS) {
      throw new Error('POST_MAX_DAYS is not defined!')
    }
    await this.#login()

    const postsToDelete = []
    const minDate = Moment().subtract(process.env.POST_MAX_DAYS, 'days')
    const posts = await this.#getAllPosts()
    if (posts?.length) {
      for (const post of posts) {
        const postDate = Moment(post.post.record.createdAt)
        if (postDate < minDate) {
          postsToDelete.push(post)
        }
      }
    }

    console.log(`Deleting ${postsToDelete.length} posts.`)
    for (const postToDelete of postsToDelete) {
      if (this.#rateLimit === -1 || this.#rateLimit > 0) {
        console.log(
          `Deleting: ${postToDelete.post.record.text} (Created ${postToDelete.post.record.createdAt})`,
        )
        try {
          if (
            postToDelete?.reason?.$type === 'app.bsky.feed.defs#reasonRepost'
          ) {
            await this.#agent.deleteRepost(postToDelete.post.viewer.repost)
          } else {
            await this.#agent.deletePost(postToDelete.post.uri)
          }
          console.log(
            `Deleted: ${postToDelete.post.record.text} (Created ${postToDelete.post.record.createdAt})`,
          )
        } catch (error) {
          console.log(
            `Could not delete: ${postToDelete.post.record.text} (Created ${postToDelete.post.record.createdAt}). Reason: ${error}`,
          )
        }

        if (this.#rateLimit > 0) {
          this.#rateLimit = this.#rateLimit - 1
        }
      } else {
        throw new Error('Rate limit exceeded!')
      }
    }
  }

  deleteLikes = async function () {
    await this.#login()
  }
}
