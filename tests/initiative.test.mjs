import test from "node:test";
import assert from "node:assert/strict";
import {normalizeCombatant,normalizeSceneState,rollInitiativeTest,sortCombatants,findInitiativeTies,isEligibleInRound,advanceTurn,selectTurn,progressPercent,getPortraitUrl} from "../core.js";

const roll = (total) => ({ dice:[total], selected:total, keep:"highest", bonus:0, total });
const actors = [
  {id:"a",combatant:{initiative:12,addedAt:1,roll:roll(12)}},
  {id:"b",combatant:{initiative:19,addedAt:2,roll:roll(19)}},
  {id:"c",combatant:{initiative:12,addedAt:3,roll:roll(12)}}
];

test("normalization preserves legacy scores but marks their old roll as invalid for OP rules",()=>{
  const value=normalizeCombatant({agility:8,training:10,bonus:"4",initiative:17});
  assert.equal(value.agility,5);
  assert.equal(value.training,10);
  assert.equal(value.bonus,4);
  assert.equal(value.initiative,17);
  assert.equal(value.roll,null);
  assert.equal(normalizeCombatant({initiative:null}).initiative,null);
});

test("agent rolls one d20 per Agility point, keeps highest and adds training",()=>{
  const values=[.1,.8,.4];
  const result=rollInitiativeTest({role:"AGENT",agility:3,training:5},()=>values.shift());
  assert.deepEqual(result.roll.dice,[3,17,9]);
  assert.equal(result.roll.selected,17);
  assert.equal(result.initiative,22);
});

test("Agility zero rolls two d20 and keeps the lowest",()=>{
  const values=[.9,.2];
  const result=rollInitiativeTest({role:"AGENT",agility:0},()=>values.shift());
  assert.deepEqual(result.roll.dice,[19,5]);
  assert.equal(result.roll.keep,"lowest");
  assert.equal(result.initiative,5);
});

test("situational modifier changes the total without altering the attribute dice pool",()=>{
  const values=[.55];
  const result=rollInitiativeTest({role:"AGENT",agility:1,training:5,bonus:-2},()=>values.shift());
  assert.deepEqual(result.roll.dice,[12]);
  assert.equal(result.initiative,15);
});

test("threat group rolls exactly one d20 and applies the group's lowest initiative bonus",()=>{
  const values=[.25];
  const result=rollInitiativeTest({role:"THREAT",threatBonus:7,bonus:2},()=>values.shift());
  assert.deepEqual(result.roll.dice,[6]);
  assert.equal(result.roll.bonus,9);
  assert.equal(result.initiative,15);
});

test("initiative sorts descending and identifies ties between valid tests",()=>{
  assert.deepEqual(sortCombatants(actors).map(entry=>entry.id),["b","a","c"]);
  assert.equal(findInitiativeTies(actors).length,1);
  assert.deepEqual(findInitiativeTies(actors)[0].entries.map(entry=>entry.id),["a","c"]);
});

test("legacy numeric results do not create false initiative ties before rerolling",()=>{
  const entries=[
    {id:"old-a",combatant:{initiative:14}},
    {id:"old-b",combatant:{initiative:14}}
  ];
  assert.equal(findInitiativeTies(entries).length,0);
});

test("surprised actors are skipped only in first round",()=>{
  const entry={id:"s",combatant:{initiative:20,surprised:true,roll:roll(20)}};
  assert.equal(isEligibleInRound(entry,1),false);
  assert.equal(isEligibleInRound(entry,2),true);
});

test("late entrants become eligible in their next round",()=>{
  const entry={id:"late",combatant:{initiative:20,availableFromRound:3,roll:roll(20)}};
  assert.equal(isEligibleInRound(entry,2),false);
  assert.equal(isEligibleInRound(entry,3),true);
});

test("turn progression skips surprised actors and increments round",()=>{
  const entries=[
    {id:"s",combatant:{initiative:20,surprised:true,roll:roll(20)}},
    {id:"a",combatant:{initiative:10,roll:roll(10)}}
  ];
  const first=advanceTurn(entries,{started:false,round:1,activeId:null},1,100);
  assert.equal(first.round,1);
  assert.equal(first.activeId,"a");
  const next=advanceTurn(entries,first,1,101);
  assert.equal(next.round,2);
  assert.equal(next.activeId,"s");
});

test("a round containing only surprised actors has no eligible turn until round two",()=>{
  const entries=[{id:"s",combatant:{initiative:9,surprised:true,roll:roll(9)}}];
  const next=advanceTurn(entries,{started:true,round:1,activeId:null},1,100);
  assert.equal(next.round,2);
  assert.equal(next.activeId,"s");
});

test("manual selection rejects surprised and late entrants until eligible",()=>{
  const entries=[
    {id:"s",combatant:{initiative:20,surprised:true,roll:roll(20)}},
    {id:"late",combatant:{initiative:15,availableFromRound:2,roll:roll(15)}}
  ];
  const state={started:true,round:1,activeId:null};
  assert.equal(selectTurn(entries,state,"s").activeId,null);
  assert.equal(selectTurn(entries,state,"late").activeId,null);
  assert.equal(selectTurn(entries,{...state,round:2},"late").activeId,"late");
});

test("previous turn wraps to last eligible actor in previous round",()=>{
  const previous=advanceTurn(actors,{started:true,round:2,activeId:"b"},-1);
  assert.equal(previous.round,1);
  assert.equal(previous.activeId,"c");
});

test("progress ignores actors unable to act in current round",()=>{
  const entries=[
    {id:"s",combatant:{initiative:20,surprised:true,roll:roll(20)}},
    {id:"a",combatant:{initiative:10,roll:roll(10)}}
  ];
  assert.equal(progressPercent(entries,{round:1,activeId:"a"}),100);
});

test("portrait helper accepts only safe image token URLs",()=>{
  assert.equal(getPortraitUrl({type:"IMAGE",image:{url:"https://assets.example/token.webp"}}),"https://assets.example/token.webp");
  assert.equal(getPortraitUrl({type:"SHAPE",image:{url:"https://assets.example/file.png"}}),null);
  assert.equal(getPortraitUrl({type:"IMAGE",image:{url:"javascript:alert(1)"}}),null);
});

test("scene normalization clamps invalid rounds",()=>{
  assert.equal(normalizeSceneState({round:-4}).round,1);
  assert.equal(normalizeSceneState({round:12,started:true}).round,12);
});