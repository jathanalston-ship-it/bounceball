// Fast 72-season check of the league economy without the game engine:
// results come from a team-strength coin flip. Checks ratings, payroll, rosters stay sane.
const L=require("../src/league.js"), P=require("../src/players.js"), E=require("../src/engine.js");
const S=L.newLeague("dry-"+(process.argv[2]||1),1954);
function fake(sp, rosters){
  const str=r=>r.slice(0,8).reduce((a,p)=>a+p.ovr,0)/8;
  const rng=E.makeRng(sp.seed); const d=str(rosters[0])-str(rosters[1])+2;
  const hw=rng.next()<1/(1+Math.exp(-d/6));
  const lines=rosters[0].concat(rosters[1]).map((p,i)=>{const m=i%13<5?32*60:i%13<9?16*60:0;const pts=Math.round(m/60*p.ovr/100*rng.range(0.4,0.9));return [p.id,m?1:0,i%13<5?1:0,m,pts,0,0,0,0,0,0,0,0,Math.round(m/600),Math.round(m/400),Math.round(m/700),0,0,0,Math.round(rng.next()*m/1200),0,0];});
  return {gid:sp.gid,hs:hw?110:100,as:hw?100:110,per:4,lines,downs:[]};
}
const rows=[];
while(S.season<=2025){
  L.startSeason(S); let sp; while((sp=L.nextGames(S))) L.applyResults(S,sp,sp.map(x=>fake(x,L.rostersFor(S,x))));
  const aw=L.finishSeason(S);
  const act=Object.values(S.players).filter(p=>p.team);
  const top=S.active.map(t=>S.teams[t].roster.map(id=>S.players[id].ovr).sort((a,b)=>b-a).slice(0,5)).flat();
  const avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
  const pay=S.active.map(t=>L.payroll(S,t)/P.capFor(S.season));
  const ages=act.map(p=>S.season-p.born);
  const ros=S.active.map(t=>S.teams[t].roster.length);
  const elite=act.filter(p=>p.ovr>=80).length;
  const txc={};for(const t of S.cur.tx)txc[t.type]=(txc[t.type]||0)+1;
  rows.push(`${S.season} teams ${S.active.length} | starter ovr ${avg(top).toFixed(1)} all ${avg(act.map(p=>p.ovr)).toFixed(1)} 80+ ${elite} | age ${avg(ages).toFixed(1)} | payroll/cap ${Math.min(...pay).toFixed(2)}-${Math.max(...pay).toFixed(2)} | roster ${Math.min(...ros)}-${Math.max(...ros)} | trades ${txc.trade||0} fa ${(txc.sign||0)} waive ${txc.waive||0} | champ ${aw.champion}`);
  L.offseason(S);
}
console.log(rows.filter((_,i)=>i%4===0||i>68).join("\n"));
const ch={};for(const c of S.champions)ch[c.champ]=(ch[c.champ]||0)+1;console.log("titles",JSON.stringify(ch));
console.log("HOF total",S.hofClasses.reduce((a,h)=>a+h.inductees.length,0),"players ever",S.nextPid-1);
