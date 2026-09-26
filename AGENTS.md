# AGENTS.md — jam

jam.phareim.no: an instrument on the radio's engine. Loops of 1–4 eight-bar
phrases; tracks played, written, grown or written by Opus; a piece can
become a radio channel. `README.md` has the map.

## Rules

- The engine is not here. `radio/` is the git submodule phareim/radio:
  change `engine/` (and `engine/piece/`, the piece format) in
  `~/github/radio`, push, then move the submodule and commit it here. Never
  edit files under `radio/` in this repo.
- The piece format and its notation are the contract with radio-api and
  Opus (`radio/engine/piece/types.ts`). Changes go through the radio repo's
  validator and tests.
- Edits never mutate `piece` in place; they go through `useJam()`'s named
  edit functions or `transact`, one undo step each.
- `server/utils/readerSession.ts` and `cloudflare.ts` are vendored and must
  stay byte-identical to the other apps'; jam's own gate is
  `server/utils/member.ts`.
- Headless Chromium on Sleeper only behind
  `flock /tmp/claude-1000/chrome.lock`, one browser at a time, closed over
  CDP.

## Commands

- `npm run dev` — port 3041, no login on localhost
- `npm test` — edits, takes, voicings
- `npm run build`

## Deploy

Push to `main`: GitHub Actions deploys the Worker `jam-web`. The backend
is radio-api (radio repo, `backend/`), deployed by the radio's push.
