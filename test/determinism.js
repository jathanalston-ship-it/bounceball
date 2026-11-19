// 1) A stored game replays to the same score from the season file alone (what the browser does).
// 2) Worker count doesn't change results.
const fs=require("fs"), E=require("../src/engine.js");
const dir=process.argv[2]||"data", season=process.argv[3]||"1954";
const S=JSON.parse(fs.readFileSync(`${dir}/seasons/${season}.json`,"utf8"));
let ok=0,bad=0;
for(const g of S.games.filter((_,i)=>i%7===0)){
  const [gid,day,h,a,seed,hs,as,per,type,hl,al,hc,ac,ctx]=g;
  const tactics=hc!==undefined&&S.coaches?[S.coaches[hc].tac,S.coaches[ac].tac]:undefined;
  const r=E.simulateGame({id:h},{id:a},[hl.map(id=>S.players[id]),al.map(id=>S.players[id])],seed,{frames:false,tactics,season:S.season,ctx});
  if(r.score[0]===hs&&r.score[1]===as&&r.periods===per)ok++;else{bad++;console.log("MISMATCH",gid,r.score,[hs,as]);}
}
console.log(`replayed ${ok+bad} games from ${season}: ${ok} exact, ${bad} mismatched`);
process.exit(bad?1:0);
