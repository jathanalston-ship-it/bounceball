# Bounceball: the United Bounceball League

A fake sports league with real history. No game result is written by hand. A physics-style
simulation plays every game, and the league's history from 1954 to today is played season by
season through the same code that will run the league live.

## The sport

Basketball on an "Akron spec" rubber floor that adds about a foot to everyone's vertical, plus:

- **Tackling.** Only the ball handler can be tackled, using football's definition. If he goes down
  holding the ball, it's an instant turnover. If the ball is already gone (shot or pass) when the hit
  lands, it's a late hit: a foul, and free throws for a shooter.
  - **Fumbles are live.** If the hit jars the ball loose before he's down, anyone can recover it.
  - **Gang tackles are legal.** Several defenders can hit him at once, and more bodies make the hit likelier to stick.
  - **Airborne players are protected.** Hitting a shooter or dunker in the air is roughing: a foul and two shots (or the shot's value if he was shooting).
  - **Offense can only set basketball screens.** A moving screen is an offensive foul.
- **Four-point line** at 30 feet, since the 1979 WBA merger. It meets the sideline, so there are no corner fours.
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
| Game engine | `src/engine.js` | Every player and the ball has an exact spot on the court, updated 20×/sec. Players decide what to do (space, cut, guard, time a tackle, chase a rebound) inside their coach's gameplan; ratings set how fast, how high and how well. Produces a play log; the box score is added up from the log. |
| Gameplans | `src/engine.js` | Before every game each coach builds a plan from his philosophy, his roster and the opponent (see below), picks a starting five and rotation that fit it, calls a play on every half-court trip, and adjusts at timeouts and halftime. |
| Players | `src/players.js` | Generated body first (height, weight, wingspan), then 20 ratings. Hidden drive decides who blooms and who wastes it. Yearly development and aging. Contracts scale with a hard cap that grows from $120k (1954) to about $40M (2026). |
| Coaches & owners | `src/staff.js` | Coaches have offense/defense/development ratings, a style (pace, tackle aggression, appetite for fours, switching screens, rotation depth) and a philosophy: the offense he believes in, the defense he teaches, his tackle policy, and how adaptable, disciplined, clutch and star-focused he is. Former players coach the way they played. Owners have patience, budgets and meddling tendencies; they fire coaches, retire, pass teams to heirs or sell them. Smart former players can become coaches. |
| Trouble | `src/trouble.js` | Players carry a hidden trouble rating. Era-appropriate incidents bring fines and suspensions (suspended players can't play); some injuries are just bad luck. Three strikes in a season and a role player is released. Coaches and owners get fined too. |
| League | `src/league.js` | 82-game balanced schedule for any team count, depth charts, injuries (mostly from tackles), playoffs, awards, Hall of Fame, draft with lottery, re-signing, free agency, trades (rebuilding teams sell veterans to contenders at the deadline), waivers with dead money, expansion drafts and the 1979 merger. |
| History runner | `scripts/sim-history.js` | Plays seasons in parallel worker threads and checkpoints after every season (`data/state.json`), so a run can stop and resume. |
| Broadcast | `site/broadcast3d.js` | 3D TV broadcast of any game: stylized players built from each player's height and weight, animated from the action the engine recorded for them (dribbling, calling a play, jump shots, dunks, tackles, lying on the rubber, getting up, boxing out, screens, a goalie walling off the rim, celebrations); arena with a crowd that stands up on big plays; auto camera director (sideline, behind the basket, free throws, timeout wide shots); automatic slow-motion instant replays (gang tackles, fumbles, alley-oops); scorebug, lower thirds and callouts; a gameplan card at tip-off and halftime, play-call tags and adjustment lower-thirds; synthesized crowd, organ, whistle, buzzer, swish and clank. |
| Player cards | `src/cards.js`, `site/cardart.js`, `site/cards.js` | 2K-style cards. Every player gets a base card for every season (his ratings as the season tipped off), plus collection cards: season leaders (Posterized for dunks, Swat Team, Wrecking Crew for tackles, Escape Artists, Four Alarm, Splash Zone, Dime Store, Board Room, Pickpockets, Bucket Brigade), awards (Most Valuable, Finals MVP, Lockdown, Rookie of the Year, Ring Bearers) and specials (Rookie Card, Founders, WBA Originals, Ironworkers, Prime, Hall of Fame, Rap Sheet). Collection cards boost the ratings they're about; the card's overall sets its rarity (Rubber → Bronze → Silver → Gold → Emerald → Sapphire → Ruby → Amethyst → Diamond → Opal → Vulcanized). Card art is drawn in SVG from the card itself: a posed figure built from the player's height and weight in his team's colors, on a background for the collection and era. Tap a card to flip it; the card viewer lists every rating with the boost. |
| Player screen | `site/cards.js` | Tap any player: hero card, bio (with his offensive and defensive archetypes), last season with league ranks, then tabs: Overview (trophy case, overall by season, career totals, career and playoff single-game highs that link to the game replay, badges), Stats (per game, totals, per 36, shooting splits, advanced, bounceball stats, season highs; regular season or playoffs; top-10 league ranks highlighted), Attributes (any season's ratings, group radar vs. career peak, changes from the year before, badges, every rating for every season), Cards (his binder) and Career (draft, trades, signings, injuries, blotter, awards). Names in a game's box score open that player's cards. |
| Viewer | `site/` | Standings, playoffs, leaders, history, Hall of Fame, police blotter, coaches (with philosophies), teams, players (with archetypes), transactions, single-game replays with play-by-play, box score and a **Strategy** tab (both gameplans, adjustments, points by play type, tackling, play calls, personnel), and **three-game TV mode**: a day's best three games air on one clock and you flip between channels. |

## Gameplans and players

**Players** get an offensive and a defensive archetype from their ratings and body, judged against
players at their position: Floor General, Shot Creator, Slasher, Bulldozer (carries it into contact),
Four Sniper (Marksman before 1979), Spot-Up Shooter, Stretch Big, Rim Runner, Post Hub; and Goalie,
Enforcer, Lockdown, Ballhawk or Liability. Each archetype has its own shot taste.

**Coaches** build a plan for every game:

| Choice | Options |
|---|---|
| Offense | **Motion** (cuts, screens away, quick and safe ball movement; the counter to tackle-happy defenses), **Heliocentric** (pick-and-roll and isolation through the star), **Power** (post-ups, bruisers carrying into contact, three on the glass), **Four Ball** (spread to 30 feet, snipers off staggered screens; 1979 on), **Bounce** (push the pace, leak outs, lobs to rim runners) |
| Defense | **Man**, **Switch Everything**, **Goalie** (the rim protector stays home and hides on their worst shooter, since 2s can be swatted on the way down), **Extend** (guard shooters out to 30 feet), **Zone** (2-3; whoever owns the area traps and hits) |
| Tackling | **Blitz** (hit early and often, full-court for the hardest hitters, gang tackles welcome), **Contain** (hit drivers and the paint), **Disciplined** (rarely hit; better position defense, no 4-on-5) |
| Matchups | A stopper on their best scorer, doubles on a dominant star, a designated hit man, the goalie's hiding spot |

An adaptable coach fits the plan to his roster and the opponent; a stubborn one runs his system
regardless. The plan hands out jobs (primary creator, post hub, rim runner, sniper, spacers, crashers),
the coach calls a set on every half-court trip (weighted by his system and who's on the floor), and
each player runs it his own way. Low-IQ, aggressive players freelance (jack shots the plan doesn't want,
hit when the policy says don't) unless the coach is a disciplinarian.

In-game coaching: halftime, fourth-quarter and timeout adjustments based on what's working (switch
systems, extend on four shooters, go to the goalie, turn the hitting up or down, double a hot star),
with no flip-flopping; foul-trouble benching; closing lineups; and late-game clock and score logic
(hold for the last shot, 2-for-1, need-a-four sets, desperation blitzes, intentional fouls, hack-a-big,
inbounding to your best free-throw shooter).

`node test/strategy-ab.js off|def|hit` replays the same games with one team's plan forced to check
that no system, scheme or tackle policy dominates (calibrated within about ±3 points; Zone is a
situational scheme and weaker when forced on any roster).

### Determinism (why the record can be tiny)

A game is a pure function of its seed, the two lineups, the two coaches' tactics, the season (rules) and the engine version. The engine uses its
own sine, cosine, log and arctangent built only from `+ - * / sqrt`, which IEEE-754 makes
bit-identical in every JavaScript engine, so a game simmed in Node replays identically in Safari or
Chrome. Each stored game is one row: `[gid, day, home, away, seed, homeScore, awayScore, periods,
type, homeLineup, awayLineup, homeCoach, awayCoach]`. The viewer replays any game from that row, with every play.

If the engine changes, old seasons must replay on the engine version they were played with
(`engineVersion` is stored in every season file).

### Derived indexes

`scripts/build-index.js` (run by the history workflow after every run) reads the season files and writes
`data/index/`: `player-seasons.json` (stat lines), `players/<id % 32>.json` (each player's ratings by season,
league ranks, single-game highs, career timeline and earned cards) and `cards.json` (every collection card).
Season files also carry made dunks (`dnk`) in the stat lines and each player's single-game highs (`highs`,
`phighs`, with the game id), counted from the play log without touching any random number, so they don't
change a single game.

### Card collections

39 collections, built by `src/cards.js` from the season files (`index/cards.json`):

- **Season leaders**: Posterized (dunks), Swat Team, Wrecking Crew (tackles), Escape Artists (broken tackles), Four Alarm, Splash Zone, Dime Store, Board Room, Pickpockets, Bucket Brigade.
- **Moments & feats**: Moments (each season's best single game in points, rebounds, assists, tackles, dunks and fours, linked to the replay), Fifty Club, Triple Threat, Postseason Heat.
- **Awards**: Most Valuable, Finals MVP, Lockdown, Rookie of the Year, Ring Bearers, Dynasty (three titles in a row).
- **Rising & veterans**: Rookie Card, Number One (first overall picks), Young Guns, Breakout (biggest overall jumps), Bench Mob, Ageless.
- **Legacies**: Prime, Franchise Icons (ten seasons with one team), Journeymen (six teams), Hall of Fame, Immortals (the 12 best careers by total Game Score).
- **Eras**: Founders, WBA Originals, Expansion Class.
- **Built different**: Skyscrapers (7'3"+), Pocket Rockets (6'0" and under), Ironworkers, Rap Sheet.

Cards at Ruby (81+) and above, plus Hall of Fame, Immortals, MVP, Finals MVP, Number One and Franchise Icons cards, carry an autograph. Moments, Hall of Fame, Immortals, Founders and Rap Sheet have their own frames (film strip, marble, nebula, vintage card stock, hazard tape), and Diamond cards get a cracked-ice foil. Big cards tilt with a moving glare.

**Packs**: the Cards page has free packs (Standard, Premium with a Ruby-or-better last card, Leaders, Moments, Legends, Oddballs and one per decade). Each card rolls its rarity tier first, then a card from that tier, so the odds are fixed whatever the pool. Pulled cards build **My collection** (set progress for every collection, owned and missing filters), stored in the browser.

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

- `node test/engine-sanity.js`: box score always equals the scoreboard; replays are identical; recording animation frames never changes a game.
- `node test/stats.js 100 1 1990`: league-wide box score averages (games, seed, season), broken down by offensive system, defensive scheme and tackle policy, plus play calls, adjustments and the mix of on-court actions (for calibrating the engine).
- `node test/strategy-ab.js off 40`: paired A/B balance check of offensive systems (`def` for schemes, `hit` for tackle policies).
- `node test/determinism.js data 1987`: stored games from a season replay to the recorded score.
- `node test/longrun-dry.js`: 72-year economy check (ratings, payroll, rosters, parity).
- `node test/cards.js`: card rules (rarity tiers, boosts, which cards a season hands out).

## Roadmap

- [x] Phase 1: game engine and broadcast view
- [x] Phase 2: seasons, playoffs, aging, draft, contracts and cap, free agency, trades, injuries, history runner
- [ ] Phase 3: lock the canon history (1954–2025) and review it
- [x] Phase 3a: coaches, owners, off-court trouble; engine v0.3 (pick-and-roll, off-ball screens, post-ups, help defense, closeouts, box-outs, timeouts); 3D broadcast and three-game TV mode
- [x] Phase 3b: engine v0.4 strategy layer: coach philosophies, gameplans, play calling, player archetypes and jobs, five offenses, five defenses, three tackle policies, matchups and doubles, in-game adjustments and late-game logic; fumbles, gang tackles, roughing, moving screens; four-point line from 1979; Strategy tab and gameplan graphics on the broadcast
- [ ] Phase 4: newsroom (Claude-written recaps, power rankings, police blotter, announcers) checked against the record
- [ ] Phase 5: live 2026 season airing on a real schedule (daily GitHub Action sims the slate; the site airs it at game time), voiced announcers
