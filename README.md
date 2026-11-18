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
  - **Hit him on the dribble and it's a loose ball.** The ball is only in his hand at the top of each bounce.
  - **Spins, jukes, stiff-arms and hurdles are legal.** A hurdler is airborne, so he's protected.
  - **Dirty hits are flagrants.** Flagrant 1: two shots and the ball. Flagrant 2: the same, plus an ejection and a one-game suspension.
  - **Hard hits hurt people.** An injured player is out for the night; the league decides how many more games he misses.
  - **The rules changed over the league's history** (engine v0.6):
    - **1969, flagrant rule:** before it, a cheap shot was just a hit, or a foul if it came late.
    - **1977, fighting crackdown:** after it, fighting means an automatic multi-game suspension.
    - **1979, four-point line.**
    - **1986:** soft-shell helmets and shoulder pads become mandatory.
    - **1998, two-man gang limit:** a third tackler piling on is a foul, and the offense keeps the ball.
    - **2011, targeting rule:** a hit to the head is an automatic flagrant 2.
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
| Front office, business, events, records (v0.7) | `src/frontoffice.js`, `src/business.js`, `src/events.js`, `src/records.js` | GMs, scouting fog, star power and feuds; markets, attendance, owners' books, relocation, TV and labor; All-Star weekend, the dunk contest, awards voting; the record book and chases. See below. |
| League | `src/league.js` | 82-game balanced schedule for any team count, depth charts, injuries (mostly from tackles), playoffs, awards, Hall of Fame, draft with lottery, re-signing, free agency, trades (rebuilding teams sell veterans to contenders at the deadline), waivers with dead money, expansion drafts and the 1979 merger. |
| History runner | `scripts/sim-history.js` | Plays seasons in parallel worker threads and checkpoints after every season (`data/state.json`), so a run can stop and resume. |
| Broadcast | `site/broadcast3d.js`, `site/broadcast.js` | 3D TV broadcast of any game. **Rendering**: HDR pipeline with bloom, anamorphic light streaks, lens dirt, filmic tone mapping, grading, vignette and grain; screen-space ambient occlusion and depth of field (focus on the subject in close-ups and replays); image-based lighting; glossy court with planar reflections; camera motion blur on fast pans (high only, with a fixed shutter so it looks the same at any frame rate) and light sharpening; quality tiers (high: reflections + SSAO + depth of field + motion blur + MSAA + 2K shadows; medium: bloom and streaks; low: direct). **Arcade style** (off when the era look is on): every big moment pops like an arcade game. A beat of hit-stop and a screen shake on big hits, slams and swats, with an impact burst. Big hits launch the ball handler into the air, and the biggest flip him. Some slams get slow motion over the rim. Ball handlers throw crossovers, double crossovers, between-the-legs and behind-the-back moves (the ball and the hands follow the move). Jukes and spin moves break ankles: the tackler sits down. Moves, dunks and launches leave afterimages. A player who heats up (the engine's own hot hand) catches fire: the ball burns in his hands and on his shots, and his sneakers leave flames. Huge slanted callouts with the player's name. The players are arcade athletes, with broad shoulders and traps, big arms, hands and sneakers, a slightly bigger head and a wider range of expression, and their animation snaps into fast moves and settles. **Players**: skinned characters (one continuous body per player with sculpted muscle: pecs, shoulder blades, lats, glutes, deltoids, biceps, triceps, forearms, quads, kneecaps and calves; athletic proportions; sculpted heads with cheekbones, jaw and chin, ears, eyes, brows, beards, hair styles with soft hairlines and strand or coil shading, dreads, ponytails and afros that swing with the head; warm light scattering at the edge of shadows on skin; era extras such as tattoo sleeves and armbands, compression tights, knee sleeves and 1970s–90s goggles; a face rig with a jaw, eyelids, eyes and brows (furrowed on defense and in pain, raised in celebration), so players blink, yell when they celebrate and dunk, grimace on the floor, and coaches shout; heads and eyes track the ball (shooters lock onto the rim, ball handlers scan the floor, dancers play to the camera); two-jointed fingers and thumbs that relax while running, cup the ball, flick through on the release, spread to contest and close into fists; breathing that gets deeper and faster as players tire, and winded players with their hands on their knees between whistles; a real walk cycle and sprint form; things to do between whistles (hitching up shorts, wiping hands, hands on the head, checking the scoreboard, clapping it up); each free-throw shooter's own routine (number of dribbles, a ball spin, the dip before the shot); chest bumps between celebrating teammates; mesh-knit jerseys; sneakers with a shaped sole, toe cap, heel, tongue and laces) built from each player's height and weight, two-bone inverse kinematics: feet lock where they land, hands grip the ball (both hands on holds, the shooting hand under the ball, the dribble hand meeting the ball at the top of the bounce), hands reach for passes and rebounds, tacklers wrap up the ball handler's hips; a keyframed run cycle; fingers; skin sheen; shorts that flutter; landing absorption and acceleration lean; uniforms and looks follow the era (1950s city-name jerseys, short shorts and canvas high-tops; 1970s afros and striped tube socks; 1990s baggy shorts and high-tops; modern arm sleeves and colored shoes), names and numbers on their jerseys, sweat sheen late in games; motion is smoothed between recorded frames (spline paths, spring-damped joints), with run, backpedal and defensive-slide blending, crossovers synced to a bouncing ball, gather and release on jumpers, shots that fit the era and the play (two-handed set shots in the 1950s, a few underhand free throw shooters before 1980, sweeping hook shots, fadeaways when drifting away from the rim, one-footed runners, finger-roll layups), passes read from the ball's flight (chest, bounce, overhead lob, one-handed baseball pass), rebounders chinning the ball with their elbows out, five dunk styles (power, tomahawk, windmill, 360 and reverse, the same one every time a play is replayed) and rim hangs, a ball that squashes on the rubber, a cool broadcast rim light on the players, tackles that dive and bodies that bounce on the rubber (the floor ripples under big hits and dunk landings, and sweat flies on impact), push-up get-ups, five celebration styles and high fives. **Officials and bad blood (engine v0.6)**: the pregame card names the crew (and its reputation) and the storylines (rivalries, history between players, revenge games, back-to-backs, long trips, stars sitting for rest); break cards count the crew's whistles; fights play out on the floor (players square up and throw hands, teammates rush in, the officials step between them) with fight, benches-clear, ejection, enforcer, no-call and pile-on graphics and replays; "heating up", "ice cold", "rattled" and "fired up" tags; soft-shell helmets from 1986 (off for studio card photos); a Strategy-tab section for the crew and the head game, and fights, hot hands and revenge in the recap. **Strategy on screen (engines v0.4 and v0.5)**: ball handlers call the play with a raised hand and a pumped fist, a goalie walls off the rim with both arms up, play-call tags (after-timeout and mismatch calls marked), a chalkboard that draws the called set with the players' numbers, coverage tags on ball screens, mismatch, flagrant, ejection and injury graphics, announcer lines for sets, traps, mismatches, big hits and moves, adjustment lower thirds, a gameplan card after the intro and at halftime, a Strategy tab (gameplans with coverage and scouting report, the playbook with points per set and chalkboard diagrams, pick-and-roll defense, tackling techniques and moves, injuries, and a recap of why the game went the way it did, also on the final card), poses for big hits, dives, spins, jukes, stiff-arms, hurdles and injured players, and replays for gang tackles, big hits, fumbles, popped dribbles, hurdles, stiff-arms and alley-oops; the four-point line only appears from 1979. **Arena**: light shafts under every light bank with dust drifting in them, sneaker scuffs worn into the court around the baskets, a broadcast grade (cool shadows, warm highlights) and lens fringing on wide angles, GPU-animated crowd with real silhouettes (hair, caps, kids) and clothes (open jackets, replica jerseys in their team's color, stripes, hoodies), foam fingers and phones that light up, that claps, stands and raises its arms by section and does the Wave once in the second and third quarters; a dance team at timeouts and halftime; courtside fans, photographers kneeling under the baskets who fire flashes on big plays, the scorer's table crew, bench players seated in uniform who stand for their team, championship banners in the rafters from the home team's actual titles (and retired numbers for its Hall of Famers), basket stanchions with a curved arm and padded base in the home colors, rafter trusses and a speaker cluster, fan signs, seat rows, cloth nets that react to the ball, backboard edge lights, light haze, a pregame light show with spotlights and phone lights, confetti when the home team wins, three referees who follow the play and signal threes, fours, fouls and timeouts, coaches pacing and reacting, a crowd that rises by section, camera flashes, scrolling LED boards, ribbon boards, a center-hung scoreboard, net swish and rim shake. **Cameras**: camera operators with momentum (the head pans with weight and settles, the body dollies slower, zooms ease), a fixed high camera at midcourt that pans and zooms with lead room instead of sliding along the sideline, and an auto director (high sideline that frames all ten players, bench reaction cutaways after big plays, baseline cam on drives, rail cam on fast breaks, free throw angles, huddle cam, crowd pans) that tells the story of each play: a low center-court angle for the tip, the baseline camera once a drive is committed, the rail or (from 2008) the cable cam on breaks, a courtside low angle on long isolations, a long-lens close-up of the scorer leading him so you see his face, then his coach or bench reacting; the referee making the call; a handheld courtside camera in the middle of fights; free throws that follow the shooter to the line, go to his face from under the basket, and cut wide for the shot, with a picture-in-picture of his coach (high quality). It holds and cuts on the action, never ping-pongs, and with the era look on uses only the cameras that era had (two in the 1950s). Long lenses rack focus onto their subject after the cut, the exposure settles like an auto-iris, handheld shots sway and roll slightly, and the scorer's line comes up under his close-up. Manual cameras: sideline, behind the basket, baseline, rail, courtside low, sky, overhead, a player cam that follows anyone you pick from the box score, and a free camera you drag and pinch. **Replays**: ¼× and ½× slow motion with a ball trail, speed-ramped replays (near real speed into the moment, a crawl through it, then back out), multi-angle instant replay packages per play type with a freeze-frame 360° orbit in the middle and AR telestration (a glowing ball tracer, rings under the players, the distance line on fours, and stat tags: shot distance, vertical leap and hang time, tackle speed) (dunk: baseline, freeze, rim cam; four: courtside, freeze, shooter iso; tackle and block: low, freeze, iso) with stinger wipes and a letterboxed replay look, a "Replay" button, a ranked Top Plays list with a "Play all" reel, and a timeline marked with quarters and big moments (no spoilers). **Era TV looks** (optional): 1950s black-and-white kinescope in 4:3 with flicker, dust and scratches; 1970s warm film with gate weave; 1990s standard-definition video with scanlines; each with a period scorebug. **TV package**: pregame matchup card (records, coaches, arena, starting lineups) followed by home starters introduced one by one under a spotlight, scorebug with timeouts left and bonus, free throw and scoring-run graphics, quarter-break stat cards, a final card with Player of the Game, an optional spoken announcer, keyboard shortcuts, and synthesized sound: crowd, organ, whistle, buzzer, swish and clank, plus positional game sounds from the picture (dribbles on the rubber, sneaker squeaks on hard cuts, landings, loose-ball bounces, all panned to where they happen and pitched down in slow motion) and crowd chants (DE-FENSE late in close games, Let's Go claps, oohs on near misses). Arena extras: a jumbotron with a live video feed and shot-clock units on the backboards; the referee tosses the opening tip. Everything is derived from the recorded game, so replays, slow motion and the free camera show the same thing every time. |
| Player cards | `src/cards.js`, `site/cardart.js`, `site/cards.js` | 2K-style cards. Every player gets a base card for every season (his ratings as the season tipped off), plus collection cards: season leaders (Posterized for dunks, Swat Team, Wrecking Crew for tackles, Escape Artists, Four Alarm, Splash Zone, Dime Store, Board Room, Pickpockets, Bucket Brigade), awards (Most Valuable, Finals MVP, Lockdown, Rookie of the Year, Ring Bearers) and specials (Rookie Card, Founders, WBA Originals, Ironworkers, Prime, Hall of Fame, Rap Sheet). Collection cards boost the ratings they're about; the card's overall sets its rarity (Rubber → Bronze → Silver → Gold → Emerald → Sapphire → Ruby → Amethyst → Diamond → Opal → Vulcanized). Card art is drawn in SVG from the card itself: a posed figure built from the player's height and weight in his team's colors, on a background for the collection and era. Tap a card to flip it; the card viewer lists every rating with the boost. |
| Player screen | `site/cards.js` | Tap any player: hero card, bio (with his offensive and defensive archetypes), last season with league ranks, then tabs: Overview (trophy case, overall by season, career totals, career and playoff single-game highs that link to the game replay, badges), Stats (per game, totals, per 36, shooting splits, advanced, bounceball stats, season highs; regular season or playoffs; top-10 league ranks highlighted), Attributes (any season's ratings, group radar vs. career peak, changes from the year before, badges, every rating for every season), Cards (his binder) and Career (draft, trades, signings, injuries, blotter, awards). Names in a game's box score open that player's cards. |
| Viewer | `site/` | Standings, playoffs, leaders, history (with the rulebook's changes by year), Hall of Fame, police blotter (with the season's fights, each linked to its replay, and its officials and their reputations), coaches (with philosophies and ball-screen coverage), teams (with their rivals and a season identity: pace, play mix, sets, mismatch hunting, four-point volume, how they tackle, coverage, ranked against the league), players (with archetypes, how they scored by play type, their makeup (clutch, streaky, tough, hothead) and their concussions and chronic conditions), transactions, single-game replays with play-by-play, box score and a **Strategy** tab (both gameplans, adjustments, points by play type, tackling, play calls, personnel), and **three-game TV mode**: a day's best three games air on one clock and you flip between channels. |

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

### Sets, coverages and the tackle game (engine v0.5)

**The playbook.** The coach's call on each trip is a real set, weighted by his system and the
situation: High pick-and-roll, **Horns**, **Spain** pick-and-roll (a back screen on the roller's man),
Clear-out isolation, Post-up, **Post split**, **Floppy** (a shooter picks a side off staggered screens),
**Elevator doors**, **Dribble handoff** and **Hammer** (a baseline drive and a kick to the corner off
a weak-side screen). Every set has roles (who handles, who screens, who cuts), moves the players
to its spots and gives the ball handler his reads. After a timeout a good late-game coach draws up his
best set for the five on the floor, and under his own basket the team runs a box set.

**Ball-screen coverage.** Each defense picks a coverage from the coach's preference and how his
bigs match up: **Drop** (the big protects the rim, giving up the pull-up), **Hedge**, **Switch**,
**Ice** (pushes the ball to the sideline) or **Hit trap** (both defenders go at the ball handler and
bury him). Offenses answer: pull-ups against drop, short rolls out of traps and hedges, slips, and
skip passes against ice. Coaches change coverage when the pick-and-roll is killing them.

**Matchups.** Offenses hunt mismatches (a big on a small in the post, a creator on a slow big) after
switches; defenses scram-switch away from the ball to fix them. Coaches scout before the game: who's
careless with the ball (hit him), who can't shoot (go under screens on him), who must never be left.

**The tackle game.** Tacklers pick a technique by temperament: a **wrap-up** (sure, rarely strips
it), a **big hit** (strips it and hurts people, but gets broken and draws flagrants) or a **dive** at the
legs. Smart tacklers time it: on the catch, or when the dribble is on the floor and the ball pops loose.
Ball handlers answer with a **juke**, **spin**, **stiff-arm** or **hurdle**, each by type (bulldozers
stiff-arm, slashers and rim runners hurdle divers, creators juke).

### The people around the game (engine v0.6)

**Referees.** The league hires officials, who age and retire. Each one has a reputation: tight or let-them-play, quick or slow to call a flagrant, and how much the home crowd gets to him. Three work each game. A tight crew calls more moving screens. A let-them-play crew lets a hit that's a hair late go. The whole crew leans, slightly, toward the home team.

**Temperament.** Every player has hidden ratings for how he handles the game:
- **Clutch:** whether he rises or shrinks in the last five minutes of a close game.
- **Streaky:** a subtle hot hand. A few makes warm him up and teammates look for him; good coaches answer by face-guarding him and sending a hitter.
- **Toughness:** big hits rattle some players (they hesitate, give up the ball, fumble more) and anger others (they drive harder and hit back).
- **Temper:** how easily he fights.

**Bad blood.** A cheap shot on a teammate, especially a star, brings out the enforcer, who goes looking for the man who did it. Sometimes it turns into a fight; teammates rush in, and now and then the benches clear. Fights were common until the 1977 crackdown and rare after it.

Grudges (from fights, flagrants and injuries) and rivalries (from geography, playoff series and fights) carry from game to game and fade over the offseason. A player traded or let go plays a revenge game against his old team.

**Chemistry.** New teammates take about thirty games to learn each other: until then they run the coach's plan less faithfully and their passes are riskier.

**The road and the body.**
- **The schedule** clusters game nights: back-to-backs, three nights in four, and travel miles all tire a team. It wears hardest in the bus-and-train years, least in the charter era.
- **Load management:** coaches rest aging and banged-up stars on back-to-backs, more often each decade from the late 1980s.
- **Concussions** add up: each one makes the next likelier and takes longer to clear, and enough of them end a career.
- **Chronic conditions:** some injuries leave a permanent condition (a bad knee, shoulder, wrist, hamstring, ankles or back). It saps ratings, keeps wearing on the player, and flares up.

Everything the engine needs for one game (the crew, tired legs, rivalry, grudges, revenge, chemistry, concussion history) is stored with the game, so replays still match the record.

### The front office, the business and the record book (league v0.7)

Where v0.6 was about the people around a game, v0.7 is about the people around a franchise. Drama wins over strict realism: dynasties, legendary seasons and feuds are meant to happen.

**Front offices** (`src/frontoffice.js`):
- **GMs are people.** Each has a style (win-now, rebuilder, gambler, loyalist, old-school, and from the 1990s analytics, which spreads), a scouting eye and a knack for deals. Owners hire and fire them, new owners bring their own, and ex-players move upstairs. Executive of the Year goes to the best turnaround.
- **Scouting fog.** No front office sees a player's true rating. Each GM sees it with an error (small for his own players, large for prospects) bent by his style: analytics loves shooters, old-school loves size and hitters, gamblers love youth. Every team drafts off its own board, so good scouts find steals and bad ones draft busts. Teams trade up on draft night.
- **Star power.** Stars on losing teams (or in a feud) demand trades and get moved at a discount. Underpaid stars hold out of camp until they get a raise, or report without one. Free agents weigh money, winning, the stars already there, the market and home, so superteams form, and veterans take less to chase a ring. Owners who are losing money dump salary on teams with room.
- **Feuds.** Big egos clash with coaches who won't feed them and with teammates who want the same shots. A feud costs chemistry; feuding teammates pass to each other less; a star feuding with his coach walks in unhappy. Two feuds split the locker room. Feuds cool, come to blows at practice, or end with a trade, or with the coach fired if the star is good enough.

**Players** (`src/players.js`):
- **The league improves.** Each generation arrives bigger (about 1.5 inches taller by the 2020s), faster and more skilled. The engine plays on that absolute scale. Cards, the player screen and every front-office decision use ratings relative to the era, so every era has its stars, and the record book ranks players both ways.
- **Skill growth.** Over the summer a player can add a skill (a jump shot, four-point range, a post game). Bigs start shooting threes in the late 1980s and fours in the 2000s. When his game changes enough, so does his position.
- **Aging styles.** Athletes can lose their legs in one summer in their early thirties, craftsmen age gracefully, a rare few seem ageless, and an athlete with drive and a high IQ can reinvent himself as a shooter.
- **Mentors.** Veterans with high IQ and drive take young teammates under their wing. Their habits rub off (work ethic, a calmer temper, toughness, poise late in games), and so does their best skill.

**The business** (`src/business.js`). Money is kept in multiples of each season's cap, so the books mean the same thing in 1958 and 2018.
- **Markets and the gate.** Every city's population moves through history: the Rust Belt shrinks and the Sun Belt booms. Every home game draws a crowd from winning, stars, the market, a new arena's buzz and the opponent. The attendance is part of the game: a full building leans on the officials, an empty one doesn't.
- **Owners' books.** Revenue (the gate, local media, a share of the national TV deal, the playoffs) against payroll and operations. Big markets spend to the cap, small markets can't, owners who lose money cut payroll, and owners who run out of money sell.
- **Relocation.** A franchise that can't draw, in a small market or an old barn, gets moved to a bigger city unless its city builds a new arena first. Out-of-town buyers often mean to move. The team keeps its name, colors and records.
- **League business.** National TV deals every few years: a big one lifts the cap, a flat one freezes it. The players form a union (threatening to boycott an All-Star game), the reserve clause falls in the mid-1970s, and later deals add revenue sharing, a rookie scale and a maximum contract. Every labor fight ends with games on schedule.

**Events** (`src/events.js`):
- **All-Star weekend**, just before the trade deadline: fans vote in the starters, coaches pick the reserves, and East plays West in a host city under full rules. It's a real engine game, replayable, and the injuries count.
- **The dunk contest**: four dunkers, two rounds, five judges, with rubber-floor specialties (off the floor bounce, from the four-point line). The viewer stages it in 3D.
- **Draft night**: the media's big board, every pick off the team's own board with reach and steal grades, trades on the night, and in the viewer a hindsight re-draft with busts and steals.
- **Awards night**: a panel of 100 voters with their own leanings (tallies kept) for MVP, Defensive Player, Rookie, Sixth Man, Most Improved, plus All-UBL teams (one per position, three deep) and All-Defense teams.

**Records** (`src/records.js`): the league keeps a record book as it goes, so before every game it knows who is chasing a milestone, a legend on the all-time list, the record itself, or (late in a season) the single-season mark. The broadcast puts the chase in the pregame storylines and calls the moment when it happens. Now and then a player has a **legendary season**: the year of his life, hidden, for one season only.

On the broadcast: attendance on the matchup card, record chases, feuds and trade demands in the storylines, a live graphic when a chase ends, and All-Star Sunday. In the viewer: a headlines wire, a headlines page per season, Awards night, All-Star weekend (with the dunk contest in 3D), the draft, a Record book (career, season and single-game lists overall and by decade, advanced stats, all-time ability two ways, franchise records), GM pages, team front offices, books, arenas and franchise moves, the league's TV and labor history, and on player pages a storyline timeline (feuds, demands, holdouts, summer work, mentors, position changes, milestones) and his ego, loyalty and aging style.

`node test/strategy-ab.js off|def|hit|cov` replays the same games with one team's plan forced to check
that no system, scheme, tackle policy or coverage dominates (calibrated within about ±3 points;
Zone is a situational scheme and weaker when forced on any roster; forcing a plan changes every
random draw after it, so single runs carry about ±2 points of noise).

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
relative to his era plus his all-time rating, advanced stats, league ranks, single-game highs, career timeline and earned cards),
`cards.json` (every collection card), `records.json` (the record book: career, season and single-game lists overall and by decade,
advanced-stat leaders, franchise records, all-time ability rankings) and `drafts.json` (every draft in hindsight).
The history run also writes `data/drafts/<year>.json` (draft night) and `data/records.json` (the league's own book).
Season files also carry made dunks (`dnk`) in the stat lines and each player's single-game highs (`highs`,
`phighs`, with the game id), counted from the play log without touching any random number, so they don't
change a single game.

### Card collections

52 collections, built by `src/cards.js` from the season files (`index/cards.json`):

- **Season leaders**: Posterized (dunks), Swat Team, Wrecking Crew (tackles), Escape Artists (broken tackles), Four Alarm, Splash Zone, Dime Store, Board Room, Pickpockets, Bucket Brigade.
- **Moments & feats**: Moments (each season's best single game in points, rebounds, assists, tackles, dunks and fours, linked to the replay), Fifty Club, Triple Threat, Postseason Heat.
- **Holidays & events**: Opening Night, Halloween Haunt, Thanksgiving Feast, Christmas Day, New Year's Eve, Heartbreakers (Valentine's Day), Leap Day, Pi Day, Luck of the Irish (St. Patrick's Day), April Fools, Friday the 13th (the star of the best game played that day), Dunktober (October's three biggest single-game dunk shows) and Game 7 (the winning side's best player in every seventh game).
- **Awards**: Most Valuable, Finals MVP, Lockdown, Rookie of the Year, Ring Bearers, Dynasty (three titles in a row).
- **Rising & veterans**: Rookie Card, Number One (first overall picks), Young Guns, Breakout (biggest overall jumps), Bench Mob, Ageless.
- **Legacies**: Prime, Franchise Icons (ten seasons with one team), Journeymen (six teams), Hall of Fame, Immortals (the 12 best careers by total Game Score).
- **Eras**: Founders, WBA Originals, Expansion Class.
- **Built different**: Skyscrapers (7'3"+), Pocket Rockets (6'0" and under), Ironworkers, Rap Sheet.

**League calendar**: the schedule numbers game days, and `seasonCalendar()` in `src/cards.js` spreads them from late October to mid-April with a game day on every holiday (Opening Night is day 0; playoff games follow every other day). Season files record each game's star (best Game Score), its top dunker and the winning side's best player (`pog`), which the holiday, Dunktober and Game 7 cards are built from.

Cards at Ruby (81+) and above, plus Hall of Fame, Immortals, MVP, Finals MVP, Number One and Franchise Icons cards, carry an autograph. Moments, Hall of Fame, Immortals, Founders, Rap Sheet and the holiday sets have their own frames (film strip, marble, nebula, vintage card stock, hazard tape, candy cane, dripping slime, hearts, chalkboard, clovers, harlequin and more), Christmas cards put a Santa hat on the player, April Fools cards are drawn mirrored,, and Diamond cards get a cracked-ice foil. **Player photos**: every card shows the player himself, rendered from the same 3D model the broadcast uses (same face, skin, hair and build, in that season's uniform) and posed for the card: a dunk on the rim, a block, a jumper, a mugshot, a trophy lift. `Broadcast3D.photo()` in `site/broadcast3d.js` shoots each one in a small studio rig and cuts it out; `site/cardart.js` places it with anchors (hands, head, floor, ball) and draws props over it. Photos are shot only for cards on screen, kept in IndexedDB between visits, and fall back to the drawn figure without WebGL (or with `localStorage["ubl-photos"] = "off"`).

Big cards tilt with a moving glare and parallax (background, player and foreground move at different depths). The Cards page features the next holiday on the real calendar.

**Packs**: the Cards page has free packs (Standard, Premium with a Ruby-or-better last card, Leaders, Moments, Holiday, Legends, Oddballs and one per decade). Each card rolls its rarity tier first, then a card from that tier, so the odds are fixed whatever the pool. Pulled cards build **My collection** (set progress for every collection, owned and missing filters), stored in the browser.

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

- `node test/engine-sanity.js`: box score always equals the scoreboard; plus/minus adds up; replays are identical; recording animation frames never changes a game.
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
- [x] Phase 3c: broadcast v2–v11 (animation overhaul, camera director and rigs, slow motion, multi-angle replays, top plays, TV graphics package)
- [x] Phase 3e: engine v0.6: rule eras (1969 flagrants, 1977 fighting crackdown, 1986 helmets, 1998 gang limit, 2011 targeting), referee crews with tendencies, enforcers, fights and brawls, temperament (clutch, streaky, toughness, temper), grudges, rivalries and revenge games, chemistry, back-to-backs and travel on a real calendar, load management, accumulating concussions and chronic injuries; fights, helmets, crew and storylines on the broadcast; rulebook, officials, rivals and player makeup in the viewer
- [x] Phase 3d: engine v0.5: set plays (Horns, Spain, Floppy, Elevator, handoffs, Hammer, post split, ATO and baseline inbound plays), ball-screen coverages and counters, mismatch hunting and scram switches, scouting, tackle techniques, evasion moves, dribble pops, flagrants, in-game injuries; chalkboard and recap on the broadcast; team identity, player scoring mix and coach coverage in the viewer
- [x] Phase 3f: league v0.7: GMs with styles and careers, scouting fog, trade demands, holdouts, superteams, salary dumps, feuds; generational improvement with era-relative ratings, skill growth and position changes, aging styles, mentors; markets, attendance, owners' books, relocation, national TV deals, the union and collective bargaining; All-Star weekend, the dunk contest (in 3D), draft night, awards voting; the record book with live chases and legendary seasons; headlines wire, records, events, GMs and the books in the viewer
- [ ] Phase 4: newsroom (Claude-written recaps, power rankings, police blotter, announcers) checked against the record
- [ ] Phase 5: live 2026 season airing on a real schedule (daily GitHub Action sims the slate; the site airs it at game time), voiced announcers
