# Skynet OS — Development Log

> Living handoff note maintained by the assistant as the user's project secretary. It records the project's purpose, verified state, user-directed goals, and deferred topics so work can resume without repetition.

## Project purpose

Skynet OS is a personal operations app. Its current focus is recording personal finances through Telegram and viewing them in the web app. The repository also contains life planning and roadmap tools, daily activity tracking, Expert Advisor (EA) development, and machine learning work.

For finance, the system should preserve the original message and an audit trail, avoid duplicate records, and make it clear which values are recorded facts versus estimates or externally sourced account values. Telegram is intended to be the single input path for routine financial entries; users should not need to re-enter the same event in the web app or spreadsheet.

## Current project state — 2026-11-05

- The web app uses Next.js App Router and SQLite at `apps/webapp/data/skynet.db`; the Telegram bot is a Node.js polling worker. Google Sheets integration uses the Apps Script webhook documented in `apps/webapp/GOOGLE_SHEETS_PLAYBOOK_CODE.md`.
- Existing finance, roadmap, reflection, tracker, and bot audit-log features are described in `README.md` and `WORKFLOW.md`. Read those files and the applicable `AGENTS.md` before changing those areas.
- Beta cashflow ledger and dashboard code was added in commit `cfb20f7` (`Add Telegram Beta portfolio cashflow ledger`) and pushed to `origin/main`.
- The Beta implementation accepts Telegram deposit and withdrawal messages, records append-only events with a Telegram-derived idempotency key, auto-creates the numbered Beta account, and shows aggregate/per-account history in the trading area. Dashboard values refresh periodically.
- Undo marks a Beta event cancelled instead of deleting it. The Sheets sync requires a successful response and matching row count; unconfirmed events remain pending for retry.
- The feature compiled with `npm run build -- --webpack`. Synthetic integration checks covered duplicate protection, dashboard/detail totals, Sheets confirmation/mismatch handling through a localhost stub, and append-only cancellation. No real Telegram message or Google Sheets webhook was used for the smoke check.
- **Not yet live end to end:** the updated Apps Script handler exists in the repository documentation but has not been deployed to Google Apps Script. Until a new script version is deployed, the bot cannot receive the new handler's confirmation and should report Sheets as unconfirmed. The production Telegram flow has not yet been verified with a real message.
- Myfxbook integration is deliberately deferred. Current value must stay unavailable until a later verified data source is connected; net contributions are not market value.

## Current portfolio model and user decisions

- The user's top-level structure is Cash, Alpha, and Beta.
- Cash is currently kept outside this tracking feature. The user may keep a separate note of what cash is reserved for.
- Beta is the first tracked area. The user wants portfolio strategy/rules to help reduce emotional decisions, while avoiding confusing or duplicate accounting when one deposit is split.
- Alpha may eventually contain distinct real accounts/approaches such as manual, bot, or evaluation accounts, but these are not implemented here.
- Treat a portfolio as an actual account or separately tracked balance, and a strategy as rules attached to that account. Do not create portfolio records for hypothetical future accounts. Record transfers between tracked accounts separately from new external deposits so totals do not count the same money twice.
- The current code supports numbered Beta accounts (`Beta 1`, `Beta 2`, …). The user's latest direction is to start from the Beta portfolio that actually exists and keep the setup simple. Before expanding account creation or adding strategy fields, confirm the real account naming and the intended treatment of a single deposit split across accounts. Do not silently reinterpret an internal transfer as new money.
- The feature only records user-entered events. It does not initiate transfers or trades.

## Existing Beta feature — outstanding verification

- The Apps Script handler has not been deployed, and the production Telegram flow has not been verified with a real message. These are known completion gaps in the already-implemented Beta feature, not authorization to make a real financial entry or send a test to production. Coordinate the test with the user when they want to continue this feature.

## User-directed goals and deferred topics

Only the user sets the next goal and its timing. When the user mentions a future idea or a problem to revisit, record it here with its status. Do not treat a parked topic as permission to inspect or change it. When the user says to start, promote that item to active work and update this log with the result.

### Parked — waiting for the user to say start

- **Master Blueprint Save control:** the user says the Save control is hard to find and wants to fix it later. Do not investigate or edit it until the user asks to start.
- **Portfolio strategies/rules:** the user wants each tracked portfolio eventually associated with a strategy/ruleset to help reduce emotional decisions. Keep the first Beta recording flow simple; do not add strategy features until the user prioritizes them.
- **Portfolio split/accounting model:** the user is concerned one deposit split across portfolios could be counted twice. Before changing the model, settle how external deposits and internal transfers should be represented. Cash is currently kept outside this tracker.
- **Home page organization:** the user finds some pages cluttered but likes the home screen as a convenient overview. Defer visual restructuring while the core flows are being made reliable; revisit when the user asks.

## Project secretary workflow

- Treat the user's latest explicit goal as the active item; do not independently pick the next feature from the parked list.
- Before work, check this log and repository rules to avoid repeating completed work. After work, record what changed, what was verified, what remains incomplete, and the commit containing it.
- Keep confirmed decisions separate from ideas and unresolved questions. If the user changes direction, update the log rather than preserving stale plans as current instructions.
- A feature is operationally complete when its core paths have been verified in the intended environment. Do not use an undefined “100%” target as a reason to block later focused work.

## Continuation and safety checklist

- Start with `AGENTS.md`, `apps/webapp/AGENTS.md`, `WORKFLOW.md`, this file, and `MISTAKES.md`.
- `MISTAKES.md` records a past recursive cache cleanup that lost four months of data and a backup. Never use broad deletion or rollback commands. Check exact paths and preserve a recoverable copy before any database operation.
- Never stage or commit `apps/webapp/data/skynet.db` as a side effect of a feature change. Treat it as user data; inspect `git status` before staging and stage only intended source/docs.
- For Next.js changes, read the relevant local Next.js guide as required by `AGENTS.md`.
- After a code change, run the relevant verification, inspect the diff, then follow the repository rule to `git add .`, commit, and push to `origin main`. If local user changes or data make that unsafe, isolate the work and do not overwrite them.
