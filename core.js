export const DEFAULT_SCENE_STATE = Object.freeze({
  started: false,
  round: 1,
  activeId: null,
  changedAt: 0
});

export function normalizeCombatant(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const initiative = Number(source.initiative);
  const conditions = Array.isArray(source.conditions)
    ? source.conditions.map((entry) => String(entry).trim()).filter(Boolean).slice(0, 8)
    : [];
  return {
    initiative: Number.isFinite(initiative) ? Math.max(-99, Math.min(999, initiative)) : 0,
    displayName: String(source.displayName || "").trim().slice(0, 80),
    conditions,
    note: String(source.note || "").slice(0, 500),
    addedAt: Number.isFinite(Number(source.addedAt)) ? Number(source.addedAt) : 0
  };
}

export function normalizeSceneState(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const round = Number(source.round);
  return {
    started: source.started === true,
    round: Number.isInteger(round) ? Math.max(1, Math.min(99999, round)) : 1,
    activeId: typeof source.activeId === "string" ? source.activeId : null,
    changedAt: Number.isFinite(Number(source.changedAt)) ? Number(source.changedAt) : 0
  };
}

export function sortCombatants(items) {
  return [...items].sort((a, b) => {
    const left = normalizeCombatant(a.combatant);
    const right = normalizeCombatant(b.combatant);
    const delta = right.initiative - left.initiative;
    if (delta !== 0) return delta;
    const byName = (left.displayName || a.name || "").localeCompare(
      right.displayName || b.name || "",
      "pt-BR",
      { sensitivity: "base" }
    );
    return byName || String(a.id).localeCompare(String(b.id));
  });
}

export function advanceTurn(combatants, sceneState, direction = 1, now = Date.now()) {
  const state = normalizeSceneState(sceneState);
  const ordered = sortCombatants(combatants);
  if (ordered.length === 0) {
    return { ...state, started: false, activeId: null, changedAt: now };
  }

  const currentIndex = ordered.findIndex((entry) => entry.id === state.activeId);
  if (currentIndex < 0) {
    const firstIndex = direction < 0 ? ordered.length - 1 : 0;
    return {
      ...state,
      started: true,
      activeId: ordered[firstIndex].id,
      changedAt: now
    };
  }

  const step = direction < 0 ? -1 : 1;
  let nextIndex = currentIndex + step;
  let round = state.round;

  if (nextIndex >= ordered.length) {
    nextIndex = 0;
    round += 1;
  } else if (nextIndex < 0) {
    nextIndex = ordered.length - 1;
    round = Math.max(1, round - 1);
  }

  return {
    started: true,
    round,
    activeId: ordered[nextIndex].id,
    changedAt: now
  };
}

export function selectTurn(combatants, sceneState, activeId, now = Date.now()) {
  const state = normalizeSceneState(sceneState);
  if (!combatants.some((entry) => entry.id === activeId)) return state;
  return { ...state, started: true, activeId, changedAt: now };
}

export function rollD20(random = Math.random) {
  return Math.floor(random() * 20) + 1;
}

export function progressPercent(combatants, sceneState) {
  const ordered = sortCombatants(combatants);
  if (!ordered.length || !sceneState?.activeId) return 0;
  const index = ordered.findIndex((entry) => entry.id === sceneState.activeId);
  return index < 0 ? 0 : Math.round(((index + 1) / ordered.length) * 100);
}

export function initials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "??";
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2))
    .toLocaleUpperCase("pt-BR");
}

export function getPortraitUrl(item) {
  const url = item?.type === "IMAGE" ? item.image?.url : null;
  return typeof url === "string" && /^https?:\/\/[^\s]+$/i.test(url) ? url : null;
}