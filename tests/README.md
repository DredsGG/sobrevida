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

Since 0.12.3 the game's internal object is found the same way the pilot finds it (no `Object.prototype` hook) and the
tests read its modules by their logical names through `mapa.js` (`nsInit()` in `espelhar-jogo.cjs`). Extra checks:
`node tests/lab-mapa.cjs` (every logical name maps to exactly one key, no hard-coded random name in the sources) and
`node tests/lab-mapa.cjs <piloto.js> Moves` (a module removed on purpose → the pilot reports `err:'mapa'`).

| Command | What it checks |
|---|---|
| `node tests/e2e.cjs extension out/e2e` | Starter picker and quiz on a simulated quiz page (`tests/site/index.html`, the game's IDs and rule; CSS, font and sprites read from `tests/.game`, or `GAME_DIR`): all 29 starters, coin-flip pairs, shuffled answers, Stop, *Answer it myself*, footer, PT/EN/ES, *What's new*, new-version and URGENTE notices. |
| `node tests/e2e-farm.cjs extension tests/.game out/farm 2` | The auto farm on the **real game** for 2 minutes: quiz to Psyduck, farm section, leaderboard seal blocked before the network, run started and played by itself, missions/gacha/upgrades, one tab at a time, `Alt+F`. |
| `node tests/pix.cjs` | The Pix codes of the Support box: free amount, R$ 5, R$ 10 and R$ 25 match the reference codes character by character, a typed amount (12,50) and the CRC16-CCITT-FALSE checksum. No browser needed. |
| `node tests/prints-github.cjs extension tests/.game docs` | The screenshots in the main README (fresh guest, English). |
| `python tests/firefox/run_firefox.py extension out/ff 120` | Real Firefox (Selenium) on the real game. Needs `tests/firefox/server.mjs` on port 443 and the hosts/certificate set up as in `.github/workflows/test.yml`. |

All of them end with `TUDO PASSOU` (all passed) or exit with an error. Everything runs offline against the local copy: Firebase, the GitHub API and `ice.pokesurvivor.com` are faked. The test guests get coins and tickets only inside the throwaway browser profile, so the farm has something to spend; never on a real account.
