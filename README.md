# Delete Bluesky Posts
A node script to run at a scheduled interval to delete your bluesky posts, reposts, and likes at a certain threshold.

## Notes
- **This script performs a very permanent function of deleting posts, reposts and/or unliking posts after a defined time period. You cannot undo this!**

## Installation
- `npm install`
- Copy `.envSample` to `.env` and update the values appropriately. You can create an app password at https://bsky.app/settings/app-passwords.

## Running
- During development: `npm start` (runs `index.ts` directly via `ts-node`).
- For production: `npm run build` to compile to `dist/`, then `node dist/index.js`.
- You may want to add this to a cron job to periodically clear out old posts (see `run.sh`).

## Debugging
- Set `BLUESKY_DEBUG=true` for verbose, timestamped diagnostics (login, pagination, deletes, and event-loop status on exit). These are written to **stderr**, so they don't touch the stdout log file unless you redirect it (e.g. `node dist/index.js >> log.txt 2>&1`).

## Development
- This project is written in TypeScript.
- `npm run build` — compile to `dist/`.
- `npm run typecheck` — type-check without emitting.
- `npm test` — run the Mocha test suite (via `ts-node`) with coverage.
- `npm run lint` — run ESLint with `--fix`.
