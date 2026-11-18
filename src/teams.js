// ===================== TEAMS & LEAGUE IDENTITY =====================
// "how": founder | expansion (expansion draft) | merger (arrives with its own WBA roster)
(function () {
const LEAGUE_INFO = {
  name: "United Bounceball League", abbr: "UBL", firstSeason: 1954, currentSeason: 2026, seasonNumber: 73,
  teams: [
    // 1954 founders: the Industrial Bounceball League
    { id:"AKR", city:"Akron", name:"Treads", c1:"#f2b134", c2:"#1d1d1f", joined:1954, era:"Founders (1954)", how:"founder", arena:"The Retread", dome:true },
    { id:"TOL", city:"Toledo", name:"Glassmen", c1:"#3fb6c9", c2:"#0d3b4f", joined:1954, era:"Founders (1954)", how:"founder", arena:"Owens Street Gym", dome:true },
    { id:"GRY", city:"Gary", name:"Smelters", c1:"#e2572b", c2:"#2b2b2b", joined:1954, era:"Founders (1954)", how:"founder", arena:"Blast Furnace Arena", dome:true },
    { id:"FLN", city:"Flint", name:"Sparkplugs", c1:"#d7263d", c2:"#f4f4f4", joined:1954, era:"Founders (1954)", how:"founder", arena:"The Plug", dome:true },
    { id:"YNG", city:"Youngstown", name:"Steelhawks", c1:"#8a9ba8", c2:"#1e2a38", joined:1954, era:"Founders (1954)", how:"founder", arena:"Mahoning Fieldhouse", dome:true },
    { id:"ERI", city:"Erie", name:"Lamprey", c1:"#2f9e44", c2:"#0b2e13", joined:1954, era:"Founders (1954)", how:"founder", arena:"Presque Isle Pavilion", dome:true },
    // 1962 pro era
    { id:"PIT", city:"Pittsburgh", name:"Ironclads", c1:"#ffcc00", c2:"#3a3f45", joined:1962, era:"Pro era (1962)", how:"expansion", arena:"Three Rivers Rubberhouse", dome:true },
    { id:"CLE", city:"Cleveland", name:"Breakers", c1:"#ff7a00", c2:"#20304f", joined:1962, era:"Pro era (1962)", how:"expansion", arena:"Lakefront Coliseum", dome:true },
    { id:"DET", city:"Detroit", name:"Pressmen", c1:"#005eb8", c2:"#c0c0c0", joined:1962, era:"Pro era (1962)", how:"expansion", arena:"Stamping Plant 9", dome:true },
    { id:"BUF", city:"Buffalo", name:"Squall", c1:"#6ec6ff", c2:"#0a2342", joined:1962, era:"Pro era (1962)", how:"expansion", arena:"The Snowbank", dome:true },
    // 1979 WBA merger
    { id:"LV",  city:"Las Vegas", name:"Jackpots", c1:"#b388ff", c2:"#1a1033", joined:1979, era:"WBA merger (1979)", how:"merger", arena:"The Felt", dome:true },
    { id:"PHX", city:"Phoenix", name:"Scorch", c1:"#ff4d00", c2:"#3a0d00", joined:1979, era:"WBA merger (1979)", how:"merger", arena:"Saguaro Center", dome:true },
    { id:"SD",  city:"San Diego", name:"Swells", c1:"#00b4d8", c2:"#03045e", joined:1979, era:"WBA merger (1979)", how:"merger", arena:"Mission Bay Bowl", dome:true },
    { id:"HOU", city:"Houston", name:"Wildcatters", c1:"#b22222", c2:"#f5deb3", joined:1979, era:"WBA merger (1979)", how:"merger", arena:"The Derrick", dome:true },
    { id:"DEN", city:"Denver", name:"Jackrabbits", c1:"#7cb518", c2:"#1b2d0c", joined:1979, era:"WBA merger (1979)", how:"merger", arena:"Mile High Rubber Bowl", dome:true },
    { id:"MIA", city:"Miami", name:"Flamingos", c1:"#ff6fa5", c2:"#00a6a6", joined:1979, era:"WBA merger (1979)", how:"merger", arena:"Biscayne Barn", dome:true },
    // expansion waves
    { id:"MEM", city:"Memphis", name:"Mojo", c1:"#6a4c93", c2:"#ffd166", joined:1986, era:"Expansion (1986–2009)", how:"expansion", arena:"The Juke Joint", dome:true },
    { id:"POR", city:"Portland", name:"Lumberjacks", c1:"#2d6a4f", c2:"#e9c46a", joined:1986, era:"Expansion (1986–2009)", how:"expansion", arena:"Timber Hall", dome:true },
    { id:"NSH", city:"Nashville", name:"Twang", c1:"#ffb703", c2:"#023047", joined:1994, era:"Expansion (1986–2009)", how:"expansion", arena:"Honky Tonk Hall", dome:true },
    { id:"ABQ", city:"Albuquerque", name:"Roadrunners", c1:"#e76f51", c2:"#264653", joined:1994, era:"Expansion (1986–2009)", how:"expansion", arena:"Sandia Dome", dome:true },
    { id:"OMA", city:"Omaha", name:"Stampede", c1:"#9d0208", c2:"#ffba08", joined:2001, era:"Expansion (1986–2009)", how:"expansion", arena:"Stockyards Arena", dome:true },
    { id:"KC",  city:"Kansas City", name:"Smoke", c1:"#e63946", c2:"#6c757d", joined:2001, era:"Expansion (1986–2009)", how:"expansion", arena:"The Pit", dome:true },
    { id:"BOI", city:"Boise", name:"Spuds", c1:"#a47148", c2:"#f1faee", joined:2009, era:"Expansion (1986–2009)", how:"expansion", arena:"The Root Cellar", dome:true },
    { id:"TUL", city:"Tulsa", name:"Twisters", c1:"#4361ee", c2:"#f72585", joined:2009, era:"Expansion (1986–2009)", how:"expansion", arena:"Funnel Cloud Fieldhouse", dome:true }
  ]
};
const TEAMS = LEAGUE_INFO.teams;
// v0.7: All-Star Sunday (never in the standings; the host's building)
const ALLSTAR = [
  { id: "ASE", city: "East", name: "All-Stars", c1: "#1f4fd1", c2: "#e8e8e8", allstar: true },
  { id: "ASW", city: "West", name: "All-Stars", c1: "#d1281f", c2: "#e8e8e8", allstar: true }
];
const API = { LEAGUE_INFO, TEAMS, ALLSTAR };
if (typeof module !== "undefined" && module.exports) module.exports = API;
else window.BB = Object.assign(window.BB || {}, API);
})();
