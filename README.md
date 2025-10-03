# Delete Bluesky Posts
A node script to run at a scheduled interval to delete your bluesky posts, reposts, and likes at a certain threshold.

## Notes
- **This script performs a very permanent function of deleting posts, reposts and/or unliking posts after a defined time period. You cannot undo this!**

## Installation
- `npm install`
- Copy `.envSample` to `.env` and update the values appropriately. You can create an app password at https://bsky.app/settings/app-passwords.

## Running
- `node index.js`
- You may want to add this to a cron job to periodically clear out old posts.

## TODO
- Tests
- Fleshing out this README
