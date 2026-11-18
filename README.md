# Bounceball: the United Bounceball League

A fake sports league with real history. No game result is written by hand. A physics-style
simulation plays every game, and the league's history from 1954 to today is played season by
season through the same code that will run the league live.

## The sport

Basketball on an "Akron spec" rubber floor that adds about a foot to everyone's vertical, plus:

- **Tackling.** Only the ball handler can be tackled, using football's definition. If he goes down
  holding the ball, it's an instant turnover. If the ball is already gone (shot or pass) when the hit
  lands, it's a late hit: a foul, and free throws for a shooter.
- **Four-point line** at 30 feet. It meets the sideline, so there are no corner fours.
- **Goaltending only on 3s and 4s.** On 2-pointers anything goes, including swatting the ball on its
  way down, as long as no hand enters the cylinder.
- 5 on 5, four 12-minute quarters, 24-second shot clock, 82-game season.

## The league

Founded in 1954 by six Rust Belt company teams (Akron, Toledo, Gary, Flint, Youngstown, Erie). It
went pro in 1962, merged with the rival Western Bounceball Association in 1979 (which brought the
four-point line), and expanded to 24 teams by 2009. Team identities are in `src/teams.js`.

## How it works

| Piece | File | What it does |
|---|---|---|
| Game engine | `src/engine.js` | Every player and the ball has an exact spot on the court, updated 20×/sec. Players decide what to do (space, cut, guard, time a tackle, chase a rebound); ratings set how fast, how high and how well. Produces a play log; the box score is added up from the log. |
| Players | `src/players.js` | Generated body first (height, weight, wingspan), then 20 ratings. Hidden drive decides who blooms and who wastes it. Yearly development and aging. Contracts scale with a hard cap that grows from $120k (1954) to about $40M (2026). |
| League | `src/league.js` | 82-game balanced schedule for any team count, depth charts, injuries (mostly from tackles), playoffs, awards, Hall of Fame, draft with lottery, re-signing, free agency, trades (rebuilding teams sell veterans to contenders at the deadline), waivers with dead money, expansion drafts and the 1979 merger. |
| History runner | `scripts/sim-history.js` | Plays seasons in parallel worker threads and checkpoints after every season (`data/state.json`), so a run can stop and resume. |
| Viewer | `site/` | Standings, playoffs, leaders, history, Hall of Fame, teams, players, transactions, and a replay of any game ever played. |

### Determinism (why the record can be tiny)

A game is a pure function of its seed, the two lineups and the engine version. The engine uses its
own sine, cosine, log and arctangent built only from `+ - * / sqrt`, which IEEE-754 makes
bit-identical in every JavaScript engine, so a game simmed in Node replays identically in Safari or
Chrome. Each stored game is one row: `[gid, day, home, away, seed, homeScore, awayScore, periods,
type, homeLineup, awayLineup]`. The viewer replays any game from that row, with every play.

If the engine changes, old seasons must replay on the engine version they were played with
(`engineVersion` is stored in every season file).

### Era adjustment

Development noise compounds over careers, so without correction the league slowly inflates. Each
offseason, ratings are nudged back toward the founding era's mean and spread, keeping individual
differences. Without this, by the 2020s the league had 4x as many 80+ players and box scores
drifted. `test/longrun-dry.js` runs all 72 years of the economy in about 2 seconds to check this.

## Running the history

1. **Actions → Simulate league history → Run workflow.** Defaults: seed `canon-1`, through 2025.
   About 54,000 games. It pauses cleanly before GitHub's 6-hour job limit; if it pauses, run it again
   and it resumes.
2. **Settings → Pages:** deploy from branch `main`, folder `/ (root)`. The league site will be at
   `https://<user>.github.io/bounceball/`.

Same seed = same history. Changing anything in the engine or league code and re-running from
scratch produces a different history, so lock it (stop re-running) once you like a run.

Locally: `node scripts/sim-history.js --seed canon-1 --to 2025 --out data --workers 4`, then
`node scripts/build-index.js data`, and serve the repo root (`python3 -m http.server`).

## Tests

- `node test/engine-sanity.js`: box score always equals the scoreboard; replays are identical.
- `node test/determinism.js data 1987`: stored games from a season replay to the recorded score.
- `node test/longrun-dry.js`: 72-year economy check (ratings, payroll, rosters, parity).

## Roadmap

- [x] Phase 1: game engine and broadcast view
- [x] Phase 2: seasons, playoffs, aging, draft, contracts and cap, free agency, trades, injuries, history runner
- [ ] Phase 3: lock the canon history (1954–2025) and review it
- [ ] Phase 4: newsroom (Claude-written recaps, power rankings, police blotter, announcers) checked against the record
- [ ] Phase 5: live season (three games at a time with easy flipping), 3D broadcast, voices
