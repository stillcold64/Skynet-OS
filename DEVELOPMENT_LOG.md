# Skynet OS — Development Log

> Living handoff note: what this project is for, what is in place, and the current point to continue from. Update this file when a meaningful feature or project decision changes. It is not a general wish list.

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

## Recommended continuation point

1. Deploy the Apps Script handler as a new version and verify the webhook's upsert-by-event-key behavior with a clearly marked test event; confirm a retry updates the same row and cancellation updates its status without appending a duplicate.
2. Verify the Telegram-to-SQLite-to-dashboard-to-Sheets path using one small, real user-authorized entry. Confirm the bot's reply reflects actual Sheets confirmation and that the dashboard shows the same entry. Preserve the event/audit history.
3. Resolve the portfolio-model question before adding more finance features: which Beta account is the initial one, and how should a single external deposit split across multiple accounts be recorded?
4. Add the strategy/rules view only after the Beta record flow is reliable. Keep rules visible with the account so they can guide decisions, without presenting a strategy label as proof of performance.
5. Once core flows are dependable, improve visual organization incrementally. Keeping the home screen as a useful cockpit is reasonable; group or simplify crowded sections based on actual use rather than redesigning every page first.

“Usable” means the core entry, audit, display, undo, and backup paths have been verified. Do not wait for a vague goal of 100% completion before making focused usability improvements.

## Continuation and safety checklist

- Start with `AGENTS.md`, `apps/webapp/AGENTS.md`, `WORKFLOW.md`, this file, and `MISTAKES.md`.
- `MISTAKES.md` records a past recursive cache cleanup that lost four months of data and a backup. Never use broad deletion or rollback commands. Check exact paths and preserve a recoverable copy before any database operation.
- Never stage or commit `apps/webapp/data/skynet.db` as a side effect of a feature change. Treat it as user data; inspect `git status` before staging and stage only intended source/docs.
- For Next.js changes, read the relevant local Next.js guide as required by `AGENTS.md`.
- After a code change, run the relevant verification, inspect the diff, then follow the repository rule to `git add .`, commit, and push to `origin main`. If local user changes or data make that unsafe, isolate the work and do not overwrite them.
