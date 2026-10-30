# Tests

The game is not in this repository. Clone the public PokéSurvivor repository first (it's the build pokesurvivor.com serves):

```
git clone --depth 1 https://github.com/JPTER78/pokesurvivor tests/.game
npm i --no-save playwright@1 && npx playwright install chromium
```

| Command | What it checks |
|---|---|
| `node tests/e2e.cjs extension out/e2e` | Starter picker and quiz on a simulated quiz page (`tests/site/index.html`, the game's IDs and rule; CSS, font and sprites read from `tests/.game`, or `GAME_DIR`): all 29 starters, coin-flip pairs, shuffled answers, Stop, *Answer it myself*, footer, PT/EN/ES, *What's new*, new-version and URGENTE notices. |
| `node tests/e2e-farm.cjs extension tests/.game out/farm 2` | The auto farm on the **real game** for 2 minutes: quiz to Psyduck, farm section, leaderboard seal blocked before the network, run started and played by itself, missions/gacha/upgrades, one tab at a time, `Alt+F`. |
| `node tests/pix.cjs` | The Pix codes of the Support box: free amount, R$ 5, R$ 10 and R$ 25 match the reference codes character by character, a typed amount (12,50) and the CRC16-CCITT-FALSE checksum. No browser needed. |
| `node tests/prints-github.cjs extension tests/.game docs` | The screenshots in the main README (fresh guest, English). |
| `python tests/firefox/run_firefox.py extension out/ff 120` | Real Firefox (Selenium) on the real game. Needs `tests/firefox/server.mjs` on port 443 and the hosts/certificate set up as in `.github/workflows/test.yml`. |

All of them end with `TUDO PASSOU` (all passed) or exit with an error. Everything runs offline against the local copy: Firebase, the GitHub API and `ice.pokesurvivor.com` are faked. The test guests get coins and tickets only inside the throwaway browser profile, so the farm has something to spend; never on a real account.
