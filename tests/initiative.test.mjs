import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCombatant,
  normalizeSceneState,
  sortCombatants,
  advanceTurn,
  selectTurn,
  rollD20,
  progressPercent,
  getPortraitUrl
} from "../core.js";

const actors = [
  { id: "a", name: "Arqueiro", combatant: { initiative: 12, displayName: "Arqueiro" } },
  { id: "b", name: "Bruxa", combatant: { initiative: 19, displayName: "Bruxa" } },
  { id: "c", name: "Cavaleiro", combatant: { initiative: 12, displayName: "Cavaleiro" } }
];

test("combatant data is normalized and bounded", () => {
  assert.deepEqual(normalizeCombatant({ initiative: "21", conditions: ["Caído", "", "Atordoado"], note: "x".repeat(600) }), {
    initiative: 21, displayName: "", conditions: ["Caído", "Atordoado"], note: "x".repeat(500), addedAt: 0
  });
  assert.equal(normalizeCombatant({ initiative: 5000 }).initiative, 999);
  assert.equal(normalizeCombatant({ initiative: "invalid" }).initiative, 0);
});

test("scene state keeps a valid round and active id", () => {
  assert.deepEqual(normalizeSceneState({ started: true, round: 0, activeId: "actor" }), {
    started: true, round: 1, activeId: "actor", changedAt: 0
  });
  assert.equal(normalizeSceneState({ round: 100000 }).round, 99999);
});

test("initiative order is descending and ties are deterministic by name", () => {
  assert.deepEqual(sortCombatants(actors).map((entry) => entry.id), ["b", "a", "c"]);
});

test("next turn starts at first actor and wraps into the next round", () => {
  const first = advanceTurn(actors, { round: 1, started: false, activeId: null }, 1, 100);
  assert.equal(first.activeId, "b");
  assert.equal(first.round, 1);
  const second = advanceTurn(actors, first, 1, 101);
  assert.equal(second.activeId, "a");
  const third = advanceTurn(actors, second, 1, 102);
  assert.equal(third.activeId, "c");
  const wrapped = advanceTurn(actors, third, 1, 103);
  assert.equal(wrapped.activeId, "b");
  assert.equal(wrapped.round, 2);
});

test("previous turn wraps to previous round without allowing round zero", () => {
  const state = { round: 1, started: true, activeId: "b" };
  const previous = advanceTurn(actors, state, -1, 200);
  assert.equal(previous.activeId, "c");
  assert.equal(previous.round, 1);
  const nextPrevious = advanceTurn(actors, { ...state, round: 4, activeId: "b" }, -1, 201);
  assert.equal(nextPrevious.activeId, "c");
  assert.equal(nextPrevious.round, 3);
});

test("selectTurn rejects unknown ids and activates valid participants", () => {
  const state = { round: 2, started: false, activeId: null };
  assert.deepEqual(selectTurn(actors, state, "missing"), normalizeSceneState(state));
  const selected = selectTurn(actors, state, "a", 99);
  assert.equal(selected.activeId, "a");
  assert.equal(selected.started, true);
  assert.equal(selected.round, 2);
});

test("empty combatant list safely stops turn progression", () => {
  const state = advanceTurn([], { round: 3, started: true, activeId: "old" }, 1, 300);
  assert.equal(state.started, false);
  assert.equal(state.activeId, null);
});

test("d20 roller stays between one and twenty", () => {
  assert.equal(rollD20(() => 0), 1);
  assert.equal(rollD20(() => 0.99999), 20);
});

test("round progress is based on current actor position", () => {
  assert.equal(progressPercent(actors, { activeId: "b" }), 33);
  assert.equal(progressPercent(actors, { activeId: "c" }), 100);
  assert.equal(progressPercent([], { activeId: null }), 0);
});

test("portrait URL is read from Owlbear image items and unsafe URLs are rejected", () => {
  assert.equal(getPortraitUrl({ type: "IMAGE", image: { url: "https://assets.example/token.webp" } }), "https://assets.example/token.webp");
  assert.equal(getPortraitUrl({ type: "IMAGE", image: { url: "http://assets.example/token.png" } }), "http://assets.example/token.png");
  assert.equal(getPortraitUrl({ type: "IMAGE", image: { url: "javascript:alert(1)" } }), null);
  assert.equal(getPortraitUrl({ type: "SHAPE", image: { url: "https://assets.example/not-a-token.png" } }), null);
  assert.equal(getPortraitUrl({ type: "IMAGE" }), null);
});
