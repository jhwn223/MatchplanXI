# Player photos

Player photographs are downloaded only from Wikimedia Commons when their metadata declares a compatible open license.

- Runtime metadata: `manifest.json`
- Local image files and full credits: `public/player-photos/`
- Refresh command: `npm run sync:player-photos`

The full sync searches every rostered player. It rate-limits requests, retries Wikimedia
throttling responses, saves a checkpoint every 25 players, and resumes by skipping player IDs
already present in `manifest.json`.

Optional filters include `--team=KOR`, `--limit=50`, `--per-team=11`, `--concurrency=1`,
and `--request-delay=500`.

Players without a verified photograph use the built-in initials avatar.
