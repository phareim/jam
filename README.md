# jam.phareim.no

An instrument on the radio's engine. A loop of one to four phrases of eight
bars; tracks you play in (piano, guitar, bass, drum pads, a touch lead),
write in a step editor, pull from a library of the radio's patterns, grow
with the radio's composer up the intensity ladder, or ask Opus to write. A
piece can become a radio channel: Opus distils it into a landscape, and a
painter paints its place from the "feel" conversation.

The sister of [radio.phareim.no](https://radio.phareim.no). The music runs
client-side on the radio's engine, included as the git submodule `radio/`;
pieces, snippets and the Opus jobs live on radio-api on Sleeper.

## Layout

```
radio/                      git submodule phareim/radio (engine/, engine/piece/, scene/assets)
pages/index.vue             the shell, JamApp inside <ClientOnly>
components/
  JamApp.client.vue         layout: transport, harmony, arrangement, instrument dock, dialogs
  Transport.vue             play, rec, click, count-in, bpm, swing, phrases, intensity, grow, space/grit, undo, save, the JAM menu
  Harmony.vue               key, scale, one chord progression per phrase, chord chips, presets
  Arrangement.vue           tracks × bars (TrackRow, BarCell, TrackLadder, Playhead, SelectionBar)
  InstrumentDock.vue        tabs; mounts components/instruments/Instrument<Name>.vue lazily
  instruments/              Piano, Guitar (notes, strum), Bass, Drums, Touch, Fretboard, InstrumentHeader, RecOptions
  dialogs/                  New, Pieces, Library, Snippet, Step, Opus, Feel, Channel, Help (on DialogFrame)
composables/
  useJam.ts                 the piece, undo, autosave, conductor, player, transport (API in its top comment)
  useRecorder.ts            captures live notes into takes (utils/takes.ts)
  useKeys.ts                computer keys: transport first, then the active instrument
  useDialogs.ts             open('name', props) → components/dialogs/<Name>Dialog.vue
  useJobs.ts, useJamApi.ts  radio-api calls; Opus jobs survive a closed dialog or a reload
  useAudition.ts, useSnippets.ts, usePointers.ts, useSounding.ts
utils/                      edits (pure piece edits), takes, voicings, keymaps — tested in tests/
server/api/                 proxies to radio-api, gated by requireMember (server/utils/member.ts)
```

- One piece conductor (`radio/engine/piece/conductor.ts`) per session,
  wrapped for the count-in, and one player with latency hint
  'interactive'. STOP is `player.cut()` + `setIdle(true)`: nothing more is
  planned, live notes keep sounding. PLAY and SEEK seek the conductor and
  start a fresh bar at once.
- A piece is plain text per bar (notation in `radio/engine/piece/types.ts`,
  `radio/docs/piece.md`). Every edit makes a new piece; undo keeps up to 100
  snapshots. The piece autosaves to localStorage (`jam.piece`, the list in
  `jam.pieces`); members also SAVE to radio-api.
- Recording: a note's place is `positionAt(heardTime())`, the audio time
  minus the output latency and a user offset (REC options). Takes are
  written at each loop wrap and when REC stops: overdub or replace,
  quantized (drums always to sixteenths), over the loop or a selection.
- Keys: Space play/stop, Enter record, [ ] intensity, Tab instrument,
  Ctrl/Cmd+Z undo, Ctrl/Cmd+C/V copy/paste bars, Delete clears, ? help;
  each instrument's own keys are listed in HELP.
- Access: anyone can play; Reader members on the allowlist save pieces and
  use Opus. In `nuxt dev` on localhost a stand-in member (`dev@localhost`)
  passes the gate so the proxies reach a local radio-api.

## Run and deploy

```bash
git submodule update --init   # radio/
npm install
npm run dev                   # http://localhost:3041
npm test                      # tests/*.test.ts
```

Push to `main`: GitHub Actions tests, builds and deploys the Worker
`jam-web` (custom domain jam.phareim.no). Worker config in `wrangler.toml`:
Reader's D1 as `DB` (read-only), `[vars]` `NUXT_RADIO_API_URL` and
`NUXT_ALLOWED_USER_EMAILS`; the secret `NUXT_RADIO_API_KEY` is radio-api's
Bearer key.

The engine changes in the radio repo first; then move the submodule here
(`git -C radio pull origin main`, commit `radio`).

## What would make it redundant

jam would be retired if the radio got its own editing surface for
channels, or if a plain DAW with the radio's voices replaced it. Then:
delete the Worker `jam-web`, drop radio-api's `/jam` routes and the
`jam_pieces` / `jam_snippets` tables (export first), archive this repo, and
mark it retired in `~/github/sleeper/docs/agent-environment-reference.md`.
