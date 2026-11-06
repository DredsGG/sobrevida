# Tests

The game is not in this repository. Since 2026-11-05 the game's public repository is gone (404), so the tests use a
local copy in `tests/.game`, filled on demand by `espelhar-jogo.cjs`: with `ESPELHAR=1`, every static game file that
is missing (html, js, css, fonts, images, `version.json`) is fetched with a plain GET from https://pokesurvivor.com
(no cookies, no login, no POST) and saved under the same path. Firebase, `ice.pokesurvivor.com`, the GitHub API and
raw.githubusercontent.com stay faked.

**`tests/.game` is a copy for local testing only.** The game is PolyForm Noncommercial and the sprites are CC BY-NC:
never commit it, never publish it, never put it in a zip (`.gitignore` covers it).

```
npm i --no-save playwright@1 && npx playwright install chromium
node tests/espelhar-jogo.cjs tests/.game        # index.html, version.json, app.min.js (prints the build hash)
ESPELHAR=1 node tests/e2e-farm.cjs extension tests/.game out/farm 2   # the first run also fetches sprites as the game asks
```

Since 0.12.3 the game's internal object is found the same way the pilot finds it and the
tests read its modules by their logical names through `mapa.js` (`nsInit()` in `espelhar-jogo.cjs`). Extra checks:
`node tests/lab-mapa.cjs` (every logical name maps to exactly one key, no hard-coded random name in the sources) and
`node tests/lab-mapa.cjs <piloto.js> Moves` (a module removed on purpose → the pilot reports `err:'mapa'`).

| Command | What it checks |
|---|---|
| `node tests/e2e.cjs extension out/e2e` | Starter picker and quiz on a simulated quiz page (`tests/site/index.html`, the game's IDs and rule; CSS, font and sprites read from `tests/.game`, or `GAME_DIR`): all 29 starters, coin-flip pairs, shuffled answers, Stop, *Answer it myself*, footer, PT/EN/ES, *What's new*, new-version and URGENTE notices. |
| `node tests/e2e-farm.cjs extension tests/.game out/farm 2` | The auto farm on the **real game** for 2 minutes: quiz to Psyduck, farm section, leaderboard seal blocked before the network, run started and played by itself, missions/gacha/upgrades, one tab at a time, `Alt+F`. |
| `node tests/lab-gacha.cjs extension/src/piloto.js` | The auto gacha: the usual region pick, and (0.12.4) the shiny mode once the collection is complete: it stops when every obtainable shiny is caught, after N pulls in a row without a new shiny (3,000; the test lowers it), or when the tickets run out, and it does nothing when the option is off. |
| `node tests/manifest.cjs extension` | The manifest is a valid Chromium MV3 one: service worker only (no `scripts`, no Firefox settings), every file it names exists, known permissions, https-only hosts. No browser needed. |
| `node tests/pix.cjs` | The Pix codes of the Support box: free amount, R$ 5, R$ 10 and R$ 25 match the reference codes character by character, a typed amount (12,50) and the CRC16-CCITT-FALSE checksum. No browser needed. |
| `node tests/prints-github.cjs extension tests/.game docs` | The screenshots in the main README (fresh guest, English). |

All of them end with `TUDO PASSOU` (all passed) or exit with an error. Everything runs offline against the local copy: Firebase, the GitHub API and `ice.pokesurvivor.com` are faked. The test guests get coins and tickets only inside the throwaway browser profile, so the farm has something to spend; never on a real account.

## What runs in GitHub Actions

- **On every push:** only lint (`web-ext lint`, with the two Firefox-only complaints about a Chromium manifest filtered out, plus `node tests/manifest.cjs`) and `node tests/pix.cjs`. Nothing is downloaded.
- **On demand (`workflow_dispatch`) and once a day (`schedule`, 07:17 UTC):** the full suite. It fetches the local game copy (`tests/espelhar-jogo.cjs`, static files only, plain GET, generic user agent, no cookies, no login), then runs `lab-mapa.cjs`, `e2e.cjs` (it reads the game's CSS, font and sprites from that copy, so it belongs here) and `e2e-farm.cjs`. The copy stays inside the job: it is never committed, cached or uploaded.
- GitHub pauses scheduled workflows in a **public** repository after 60 days without repository activity; a push or a manual run starts them again.
