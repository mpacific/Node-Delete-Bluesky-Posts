import { BskyAgent, AppBskyFeedDefs } from '@atproto/api'
import Moment from 'moment-timezone'

type FeedViewPost = AppBskyFeedDefs.FeedViewPost

interface PostRecord {
  text?: string
  createdAt?: string
}

const recordOf = (post: FeedViewPost): PostRecord =>
  post.post.record as PostRecord

export default class Bluesky {
  #agent: BskyAgent | null = null
  #rateLimit = -1
  #cursor: string | undefined = undefined

  #login = async function (this: Bluesky): Promise<void> {
    if (this.#agent) {
      return
    }

    this.#agent = new BskyAgent({
      service: 'https://bsky.social',
    })

    await this.#agent.login({
      identifier: process.env.BLUESKY_USERNAME as string,
      password: process.env.BLUESKY_APP_PASSWORD as string,
    })
  }

  #getAllPosts = async function (this: Bluesky): Promise<FeedViewPost[]> {
    this.#cursor = undefined
    let allPosts: FeedViewPost[] = []
    const limit = 100
    let fetchMore = true

    while (fetchMore) {
      if (this.#rateLimit === -1 || this.#rateLimit > 0) {
        const response = await this.#agent!.getAuthorFeed({
          actor: process.env.BLUESKY_USERNAME as string,
          cursor: this.#cursor || undefined,
          includePins: false,
          limit,
        })

        this.#rateLimit = parseInt(
          response.headers['ratelimit-remaining'] ?? '',
        )
        this.#cursor = response?.data?.cursor

        if (response?.data?.feed?.length) {
          allPosts = allPosts.concat(response.data.feed)
        }

        fetchMore = !!this.#cursor
      } else {
        throw new Error('Rate limit exceeded!')
      }
    }

    return allPosts
  }

  #getAllLikes = async function (this: Bluesky): Promise<FeedViewPost[]> {
    this.#cursor = undefined
    let allLikes: FeedViewPost[] = []
    const limit = 100
    let fetchMore = true

    while (fetchMore) {
      if (this.#rateLimit === -1 || this.#rateLimit > 0) {
        const response = await this.#agent!.app.bsky.feed.getActorLikes({
          actor: process.env.BLUESKY_USERNAME as string,
          cursor: this.#cursor || undefined,
          limit,
        })

        this.#rateLimit = parseInt(
          response.headers['ratelimit-remaining'] ?? '',
        )
        this.#cursor = response?.data?.cursor

        if (response?.data?.feed?.length) {
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

  #getOldPosts = async function (
    this: Bluesky,
    allPosts: FeedViewPost[],
    maxDays: string | number,
  ): Promise<FeedViewPost[]> {
    const postsToDelete: FeedViewPost[] = []
    const minDate = Moment().subtract(maxDays, 'days')

    if (allPosts?.length) {
      for (const post of allPosts) {
        const postDate = Moment(recordOf(post).createdAt)
        if (postDate < minDate) {
          postsToDelete.push(post)
        }
      }
    }

    return postsToDelete
  }

  #deleteOldPosts = async function (
    this: Bluesky,
    postsToDelete: FeedViewPost[],
  ): Promise<void> {
    console.log(`Deleting ${postsToDelete.length} posts.`)

    for (const postToDelete of postsToDelete) {
      if (this.#rateLimit === -1 || this.#rateLimit > 0) {
        const record = recordOf(postToDelete)
        console.log(`Deleting: ${record.text} (Created ${record.createdAt})`)

        if (postToDelete?.reason?.$type === 'app.bsky.feed.defs#reasonRepost') {
          await this.#agent!.deleteRepost(postToDelete.post.viewer!.repost!)
        } else {
          await this.#agent!.deletePost(postToDelete.post.uri)
        }
        console.log(`Deleted: ${record.text} (Created ${record.createdAt})`)

        if (this.#rateLimit > 0) {
          this.#rateLimit = this.#rateLimit - 1
        }
      } else {
        throw new Error('Rate limit exceeded!')
      }
    }
  }

  #deleteOldLikes = async function (
    this: Bluesky,
    likesToDelete: FeedViewPost[],
  ): Promise<void> {
    console.log(`Deleting ${likesToDelete.length} likes.`)

    for (const likeToDelete of likesToDelete) {
      if (this.#rateLimit === -1 || this.#rateLimit > 0) {
        const record = recordOf(likeToDelete)
        console.log(`Deleting: ${record.text} (Created ${record.createdAt})`)

        await this.#agent!.deleteLike(likeToDelete.post.viewer!.like!)
        console.log(`Deleted: ${record.text} (Created ${record.createdAt})`)

        if (this.#rateLimit > 0) {
          this.#rateLimit = this.#rateLimit - 1
        }
      } else {
        throw new Error('Rate limit exceeded!')
      }
    }
  }

  deletePosts = async function (this: Bluesky): Promise<void> {
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

  deleteLikes = async function (this: Bluesky): Promise<void> {
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
