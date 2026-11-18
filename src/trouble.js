// ===================== TROUBLE: the police blotter =====================
// Players carry a hidden "trouble" rating. Most incidents are their own doing; some are just bad luck.
// Templates are tied to eras ([text, kind, severity, fromYear, toYear]) so nobody rides a jet ski in 1958.
"use strict";
(function () {
const NODE = typeof module !== "undefined" && module.exports;
const E = NODE ? require("./engine.js") : window.BB;
const P = NODE ? require("./players.js") : window.BB;
const { clamp } = E;

// kind: fine | susp (suspension) | arrest (suspension + fine)
const PLAYER = [
  ["was arrested for driving a golf cart through a bank drive-thru and asking for a milkshake", "arrest", 2, 1958, 9999],
  ["was cited for parking a monster truck across six spaces outside a children's hospital", "susp", 1, 1975, 9999],
  ["was fined for tackling the team mascot during pregame warmups", "fine", 1, 1954, 9999],
  ["was suspended for tackling a referee who he said \"looked like he had the ball\"", "susp", 3, 1954, 9999],
  ["was arrested for stealing a 300-pound tire from the lobby of the Akron Rubber Museum", "arrest", 2, 1966, 9999],
  ["was found asleep inside a bounce house at a child's birthday party he had not been invited to", "fine", 1, 1960, 9999],
  ["was caught installing his own rubber flooring in the visitors' locker room", "fine", 1, 1954, 9999],
  ["was fined for calling the four-point line \"more of a suggestion\" at a press conference", "fine", 1, 1979, 9999],
  ["was charged with releasing 400 crickets in a rival team's hotel", "arrest", 2, 1954, 9999],
  ["was suspended for selling counterfeit Hall of Fame plaques out of his trunk", "susp", 2, 1965, 9999],
  ["was arrested at a Renaissance faire after challenging a knight to a \"real joust\"", "arrest", 2, 1970, 9999],
  ["was fined for arriving at a road game in a full suit of armor", "fine", 1, 1954, 9999],
  ["was caught reselling the team's game-worn sneakers as \"gently used\"", "fine", 1, 1954, 9999],
  ["was banned from his own bowling league for trying to tackle the pins", "fine", 1, 1954, 9999],
  ["was arrested for operating a jet ski in the city's decorative fountain", "arrest", 2, 1975, 9999],
  ["was suspended after a livestream showed him tackling a vending machine", "susp", 2, 2015, 9999],
  ["was fined for flying a drone over a rival's practice towing a banner that read FOURS ARE FOREVER", "fine", 1, 2014, 9999],
  ["was fined for paging the commissioner's office 212 times in one night", "fine", 1, 1985, 2002],
  ["was suspended after a CB radio feud with a trucker turned into a fistfight at a rest stop", "susp", 2, 1970, 1990],
  ["was arrested for drag racing a milk truck down Main Street", "arrest", 2, 1954, 1975],
  ["was caught sneaking into a drive-in theater in the trunk of a teammate's car", "fine", 1, 1954, 1990],
  ["was fined for hosting an unsanctioned trampoline dunk contest on a hotel roof", "fine", 2, 1960, 9999],
  ["was cited for riding an electric scooter through an airport terminal", "fine", 1, 2017, 9999],
  ["was suspended for punching a hole in the locker room wall \"to test the drywall\"", "susp", 2, 1954, 9999],
  ["was fined after his pet goat wandered onto the court during a timeout", "fine", 1, 1954, 9999],
  ["was arrested for impersonating a referee at a youth league game", "arrest", 2, 1954, 9999],
  ["was fined for skipping a team flight to drive a hovercraft across a lake", "fine", 1, 1990, 9999],
  ["was suspended after a 3 a.m. karaoke performance ended with a police escort", "susp", 1, 1980, 9999],
  ["was arrested for borrowing the team bus \"to get to the arena faster\"", "arrest", 3, 1954, 9999],
  ["was suspended after tackling a teammate in the arena parking lot over a parking spot", "susp", 2, 1954, 9999],
  ["was fined for wearing the rival team's hat in the official team photo", "fine", 1, 1954, 9999],
  ["was suspended after a brawl with a fan over the correct way to make chili", "susp", 2, 1954, 9999],
  ["was cited for keeping 14 raccoons in his apartment and calling them \"roommates\"", "fine", 1, 1954, 9999],
  ["was arrested for running an unlicensed fireworks stand out of his locker", "arrest", 2, 1954, 9999],
  ["was fined for faking a hamstring injury to attend a monster truck rally", "fine", 2, 1975, 9999],
  ["was suspended for selling \"official Akron spec floor samples\" that turned out to be bath mats", "susp", 2, 1983, 9999],
  ["was arrested after a slow-speed chase on a parade float", "arrest", 2, 1954, 9999],
  ["was fined for promoting a cryptocurrency called BounceCoin during a postgame interview", "fine", 1, 2018, 9999],
  ["was suspended for throwing the front office fax machine into the hotel pool", "susp", 1, 1982, 2005],
  ["was fined for taping over the team's game film with his favorite soap opera", "fine", 1, 1978, 2005],
  ["was arrested for starting a bar brawl over who invented the four-point line", "arrest", 2, 1972, 9999],
  ["was suspended for missing practice to go on an unannounced fishing trip", "susp", 2, 1954, 9999],
  ["was fined after his selfie stick hit a teammate during the national anthem", "fine", 1, 2013, 9999],
  ["was arrested for dumping a truckload of rubber balls onto the interstate \"as a promotion\"", "arrest", 2, 1960, 9999],
  ["was suspended after trying to settle a contract dispute by arm-wrestling the general manager", "susp", 1, 1954, 9999],
  ["was fined for hiding a whoopee cushion under the commissioner's podium on draft night", "fine", 1, 1954, 9999],
  ["was arrested for trying to pay for gas with autographed trading cards", "arrest", 1, 1960, 9999],
  ["was suspended after a viral video showed him tackling a man in a hot dog costume at a minor league baseball game", "susp", 3, 2008, 9999],
  ["was fined for using a team towel as a cape during the opponent's free throws", "fine", 1, 1954, 9999]
];
// bad luck: [text, minGames, maxGames, from, to]
const LUCK = [
  ["was bitten by a raccoon while taking out the trash", 1, 5, 1954, 9999],
  ["sprained an ankle on his kids' backyard trampoline", 3, 10, 1960, 9999],
  ["was hit in the face by a foul ball at a minor-league baseball game", 2, 6, 1954, 9999],
  ["fell off a float in a Fourth of July parade", 5, 15, 1954, 9999],
  ["was concussed by a ceiling fan while celebrating a win at home", 3, 8, 1960, 9999],
  ["was stung by dozens of bees while filming a honey commercial", 1, 4, 1958, 9999],
  ["slipped on a banana peel. An actual banana peel.", 2, 8, 1954, 9999],
  ["pulled a hamstring chasing an ice cream truck", 4, 12, 1954, 9999],
  ["broke a toe kicking a vending machine that ate his dollar", 5, 14, 1954, 9999],
  ["was stepped on by a horse during a charity rodeo appearance", 6, 20, 1954, 9999],
  ["hurt his back carrying a 70-inch television up four flights of stairs", 3, 10, 2005, 9999],
  ["was tackled by an overly excited fan at the airport", 2, 6, 1954, 9999],
  ["cut his hand opening a jar of pickles with a steak knife", 2, 7, 1954, 9999],
  ["tripped over his dog and fell down the stairs", 3, 9, 1954, 9999]
];
const COACH = [
  ["was fined for calling the officials \"a committee of blind accountants\"", "fine"],
  ["was suspended for tackling his own assistant coach during a timeout", "susp"],
  ["was fined for painting a five-point line on the practice floor and refusing to explain it", "fine"],
  ["was fined after carrying the scorer's table onto the court to protest a call", "fine"],
  ["was suspended for chasing a referee into the parking lot", "susp"],
  ["was fined for drawing up a play on the back of a referee's shirt", "fine"]
];
const OWNER = [
  ["was fined by the league for trying to pay the referees in frozen pizzas", 1954, 9999],
  ["was fined for installing a hidden trampoline under his own team's basket", 1954, 9999],
  ["was fined after storming the court to argue a goaltending call", 1967, 9999],
  ["was fined for posting that the league \"desperately needs a five-point line\"", 2009, 9999],
  ["was fined for releasing a live turkey into the visitors' locker room", 1954, 9999]
];
const eraOk = (t, y, a, b) => y >= t[a] && y <= t[b];

// Roll one game day of trouble. Returns blotter entries; applies suspensions/injuries/fines.
function rollDay(S, rng, opt) {
  const out = [], y = S.season, cap = P.capFor(y);
  for (const tid of S.active) {
    const t = S.teams[tid];
    for (const id of t.roster.slice()) {
      const p = S.players[id]; const tr = p.trouble || 0.25;
      if (rng.chance(0.00025 + 0.0045 * tr * tr)) {
        const pool = PLAYER.filter(x => eraOk(x, y, 3, 4)), tpl = rng.pick(pool);
        const [text, kind, sev] = tpl;
        const games = kind === "fine" ? 0 : sev === 1 ? 1 : sev === 2 ? rng.int(2, 5) : rng.int(8, 20);
        const fine = kind === "susp" ? 0 : Math.max(Math.round(cap * 0.0005 / 100) * 100, Math.round((p.contract ? p.contract.salary : cap * 0.02) * (0.01 * sev + rng.next() * 0.02) / 100) * 100);
        if (games) p.susp = (p.susp || 0) + games;
        p.raps = (p.raps || 0) + 1;
        if (p.rapSeason !== y) { p.rapSeason = y; p.rapCount = 0; }
        p.rapCount++;
        const e = { who: "player", id, team: tid, text, kind, games, fine, day: S.cur.day };
        out.push(e);
        // three strikes in a season and you're gone, unless you're one of the team's best five
        if (p.rapCount >= 3 && opt && opt.release) {
          const top5 = t.roster.map(i => S.players[i]).sort((a, b) => b.ovr - a.ovr).slice(0, 5).map(q => q.id);
          if (!top5.includes(id)) { opt.release(p, tid); e.released = true; }
        }
      } else if (rng.chance(0.00022)) {
        const tpl = rng.pick(LUCK.filter(x => eraOk(x, y, 3, 4)));
        const games = rng.int(tpl[1], tpl[2]);
        if (!p.injury || p.injury.out <= 0) p.injury = { name: "off-court injury", out: games };
        out.push({ who: "player", id, team: tid, text: tpl[0], kind: "luck", games, fine: 0, day: S.cur.day });
      }
    }
    const c = S.coaches[t.coach];
    if (c && rng.chance(0.00025 + (c.trouble || 0.1) * 0.0012)) {
      const tpl = rng.pick(COACH);
      out.push({ who: "coach", id: c.id, team: tid, text: tpl[0], kind: tpl[1], games: tpl[1] === "susp" ? rng.int(1, 3) : 0, fine: Math.round(cap * rng.range(0.0005, 0.002) / 100) * 100, day: S.cur.day });
    }
    const o = S.owners[t.owner];
    if (o && rng.chance(0.00006)) {
      const pool = OWNER.filter(x => eraOk(x, y, 1, 2));
      out.push({ who: "owner", id: o.id, team: tid, text: rng.pick(pool)[0], kind: "fine", games: 0, fine: Math.round(cap * rng.range(0.002, 0.01) / 100) * 100, day: S.cur.day });
    }
  }
  return out;
}
const API = { rollTrouble: rollDay, TROUBLE_TEMPLATES: { PLAYER, LUCK, COACH, OWNER } };
if (NODE) module.exports = API; else window.BB = Object.assign(window.BB || {}, API);
})();
