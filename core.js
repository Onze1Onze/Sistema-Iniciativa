export const DEFAULT_SCENE_STATE=Object.freeze({started:false,round:1,activeId:null,changedAt:0});
export const TRAINING_LEVELS=Object.freeze([0,5,10,15]);
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
const integer=(v,f,min,max)=>{const n=Number(v);return Number.isInteger(n)?clamp(n,min,max):f;};
const nullable=(v)=>{if(v===null||v===undefined||v==="")return null;const n=Number(v);return Number.isFinite(n)?clamp(n,-999,9999):null;};
export function normalizeCombatant(value={}){
 const s=value&&typeof value==="object"?value:{},role=s.role==="THREAT"?"THREAT":"AGENT";
 return {role,displayName:String(s.displayName||"").trim().slice(0,80),groupId:String(s.groupId||"").slice(0,100),groupName:String(s.groupName||"").trim().slice(0,80),
 agility:integer(s.agility,1,0,5),training:TRAINING_LEVELS.includes(Number(s.training))?Number(s.training):0,
 bonus:clamp(Number.isFinite(Number(s.bonus))?Number(s.bonus):0,-99,99),
 threatBonus:clamp(Number.isFinite(Number(s.threatBonus))?Number(s.threatBonus):0,-99,99),
 diceModifier:integer(s.diceModifier,0,-5,5),threatDice:integer(s.threatDice,2,1,12),initiative:nullable(s.initiative),
 roll:s.roll&&typeof s.roll==="object"&&Array.isArray(s.roll.dice)?{dice:s.roll.dice.map(x=>integer(x,1,1,20)).slice(0,24),selected:integer(s.roll.selected,1,1,20),keep:s.roll.keep==="lowest"?"lowest":"highest",bonus:clamp(Number(s.roll.bonus)||0,-199,199),total:nullable(s.roll.total)}:null,
 surprised:s.surprised===true,availableFromRound:integer(s.availableFromRound,1,1,99999),
 conditions:Array.isArray(s.conditions)?s.conditions.map(x=>String(x).trim()).filter(Boolean).slice(0,8):[],
 note:String(s.note||"").slice(0,500),addedAt:Number.isFinite(Number(s.addedAt))?Number(s.addedAt):0};
}
export function normalizeSceneState(value={}){
 const s=value&&typeof value==="object"?value:{},r=Number(s.round);
 return {started:s.started===true,round:Number.isInteger(r)?clamp(r,1,99999):1,activeId:typeof s.activeId==="string"?s.activeId:null,changedAt:Number.isFinite(Number(s.changedAt))?Number(s.changedAt):0};
}
function getPool(combatant){
 const d=normalizeCombatant(combatant),base=d.role==="THREAT"?d.threatDice:(d.agility===0?2:d.agility),adjusted=base+d.diceModifier;
 if(adjusted<1)return {count:clamp(base+Math.abs(d.diceModifier),1,24),keep:"lowest"};
 return {count:clamp(adjusted,1,24),keep:d.role==="AGENT"&&d.agility===0?"lowest":"highest"};
}
export function rollInitiativeTest(combatant,random=Math.random){
 const d=normalizeCombatant(combatant),pool=getPool(d);
 const dice=Array.from({length:pool.count},()=>{const v=Number(random());return clamp(Math.floor((Number.isFinite(v)?v:0)*20)+1,1,20);});
 const selected=pool.keep==="lowest"?Math.min(...dice):Math.max(...dice);
 const training=d.role==="AGENT"?d.training:0,threat=d.role==="THREAT"?d.threatBonus:0,totalBonus=training+threat+d.bonus,total=selected+totalBonus;
 return {...d,initiative:total,roll:{dice,selected,keep:pool.keep,bonus:totalBonus,total}};
}
export function sortCombatants(entries){
 return [...entries].sort((a,b)=>{const l=normalizeCombatant(a.combatant),r=normalizeCombatant(b.combatant),ls=l.initiative===null?-Infinity:l.initiative,rs=r.initiative===null?-Infinity:r.initiative;
 if(rs!==ls)return rs-ls;if(l.addedAt!==r.addedAt)return l.addedAt-r.addedAt;return String(a.id).localeCompare(String(b.id),"pt-BR",{sensitivity:"base"});});
}
export function findInitiativeTies(entries){
 const m=new Map();for(const e of entries){const v=normalizeCombatant(e.combatant).initiative;if(v===null)continue;const g=m.get(v)||[];g.push(e);m.set(v,g);}
 return [...m.entries()].filter(([,g])=>g.length>1).map(([initiative,entries])=>({initiative,entries}));
}
export function isEligibleInRound(entry,round){const d=normalizeCombatant(entry.combatant);return d.availableFromRound<=round&&(!d.surprised||round>1);}
export function eligibleCombatants(entries,round){return sortCombatants(entries).filter(e=>isEligibleInRound(e,round));}
export function advanceTurn(entries,sceneState,direction=1,now=Date.now()){
 const s=normalizeSceneState(sceneState),ordered=sortCombatants(entries);if(!ordered.length)return {...s,started:false,activeId:null,changedAt:now};
 const max=Math.max(s.round+2,...ordered.map(e=>normalizeCombatant(e.combatant).availableFromRound+1));
 if(direction>=0){for(let round=s.round;round<=max;round++){const e=eligibleCombatants(ordered,round);if(!e.length)continue;const i=round===s.round?e.findIndex(x=>x.id===s.activeId):-1,n=i<0?0:i+1;if(n<e.length)return {started:true,round,activeId:e[n].id,changedAt:now};}}
 else{for(let round=s.round;round>=1;round--){const e=eligibleCombatants(ordered,round);if(!e.length)continue;const i=round===s.round?e.findIndex(x=>x.id===s.activeId):-1,p=i<0?e.length-1:i-1;if(p>=0)return {started:true,round,activeId:e[p].id,changedAt:now};}}
 return {...s,changedAt:now};
}
export function selectTurn(entries,sceneState,id,now=Date.now()){const s=normalizeSceneState(sceneState),e=entries.find(x=>x.id===id);return !e||!isEligibleInRound(e,s.round)?s:{...s,started:true,activeId:id,changedAt:now};}
export function progressPercent(entries,sceneState){const s=normalizeSceneState(sceneState),e=eligibleCombatants(entries,s.round);if(!e.length||!s.activeId)return 0;const i=e.findIndex(x=>x.id===s.activeId);return i<0?0:Math.round((i+1)/e.length*100);}
export function initials(name=""){const p=String(name).trim().split(/\s+/).filter(Boolean);if(!p.length)return "??";return (p.length>1?p[0][0]+p[p.length-1][0]:p[0].slice(0,2)).toLocaleUpperCase("pt-BR");}
export function getPortraitUrl(item){const u=item?.type==="IMAGE"?item.image?.url:null;return typeof u==="string"&&/^https?:\/\/[^\s]+$/i.test(u)?u:null;}