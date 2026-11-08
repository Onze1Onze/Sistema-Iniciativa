import OBR from "https://esm.sh/@owlbear-rodeo/sdk@3.1.0";
import {
  DEFAULT_SCENE_STATE,
  normalizeCombatant,
  normalizeSceneState,
  rollInitiativeTest,
  sortCombatants,
  findInitiativeTies,
  isEligibleInRound,
  advanceTurn,
  selectTurn,
  progressPercent,
  initials,
  getPortraitUrl
} from "./core.js?v=2.0.0";

const EXTENSION_ID = "com.onze1onze.sistema-iniciativa";
const ITEM_KEY = EXTENSION_ID + "/combatant";
const SCENE_KEY = EXTENSION_ID + "/combat";
const $ = (selector) => document.querySelector(selector);

let allItems = [];
let sceneState = { ...DEFAULT_SCENE_STATE };
let pendingAdd = [];
let editingId = null;
let busy = false;
let sceneReady = false;
let listenersAttached = false;
let toastTimer = null;

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "op-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function notify(message, kind = "info") {
  const toast = $("#toast");
  toast.textContent = message;
  toast.className = "toast visible " + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2800);
}

function setConnection(connected, label) {
  $("#connection").classList.toggle("connected", connected);
  $("#connection").innerHTML = "<i></i> " + escapeHTML(label);
}

function setSaving(message, state = "") {
  $("#save-state").textContent = message;
  $("#save-state").dataset.state = state;
}

function getParticipants() {
  const grouped = new Map();

  for (const item of allItems) {
    if (item.type !== "IMAGE" || item.layer !== "CHARACTER") continue;
    const raw = item.metadata?.[ITEM_KEY];
    if (!raw) continue;

    const data = normalizeCombatant(raw);
    const groupId = data.role === "THREAT" ? data.groupId || item.id : item.id;
    const id = groupId;
    if (!grouped.has(id)) {
      grouped.set(id, {
        id,
        groupId,
        name: data.displayName || item.name || "Envolvido",
        combatant: { ...data, groupId },
        members: [],
        tokenIds: []
      });
    }
    const entry = grouped.get(id);
    entry.members.push(item);
    entry.tokenIds.push(item.id);
    if (!entry.combatant.displayName && item.name) {
      entry.name = item.name;
    }
  }

  return sortCombatants([...grouped.values()]);
}

function portraitMarkup(entry, className) {
  const members = (entry.members || []).slice(0, 3);
  const units = members.map((item, index) => {
    const url = getPortraitUrl(item);
    const fallback = initials(entry.combatant.displayName || item.name || entry.name);
    return '<span class="portrait-unit" style="--portrait-index:' + index + '">' +
      (url
        ? '<img data-portrait src="' + escapeHTML(url) + '" alt="" loading="lazy" draggable="false"><span class="portrait-fallback">' + escapeHTML(fallback) + '</span>'
        : '<span class="portrait-fallback">' + escapeHTML(fallback) + '</span>') +
    '</span>';
  }).join("");
  return '<div class="' + className + '" aria-hidden="true">' + units + '</div>';
}

function bindPortraitFallback(root) {
  root.querySelectorAll("img[data-portrait]").forEach((image) => {
    image.addEventListener("error", () => {
      image.remove();
    }, { once: true });
  });
}

function roleDetails(data) {
  if (data.role === "THREAT") {
    const flat = data.threatBonus + data.bonus;
    return data.threatDice + "d20 · BÔNUS " + (flat >= 0 ? "+" : "") + flat;
  }
  const grade = data.training === 0 ? "DESTREINADO" : data.training === 5 ? "TREINADO" : data.training === 10 ? "VETERANO" : "EXPERT";
  return "AGI " + data.agility + " · " + grade + " " + (data.training >= 0 ? "+" : "") + data.training;
}

function rollDetails(data) {
  if (!data.roll) return "TESTE PENDENTE · AJUSTE A FICHA E ROLE";
  const dice = data.roll.dice.join(" · ");
  const kept = data.roll.keep === "lowest" ? "MENOR" : "MAIOR";
  const bonus = (data.roll.bonus >= 0 ? "+" : "") + data.roll.bonus;
  return data.roll.dice.length + "d20 [" + dice + "] · " + kept + " " + data.roll.selected + " " + bonus + " = " + data.roll.total;
}

function renderEntry(entry, index, activeId, ties) {
  const data = entry.combatant;
  const active = entry.id === activeId;
  const isTie = ties.some((group) => group.entries.some((candidate) => candidate.id === entry.id));
  const late = sceneState.started && data.availableFromRound > sceneState.round;
  const surprised = data.surprised && sceneState.round === 1;
  const score = data.initiative === null ? "—" : String(data.initiative);
  const memberWord = entry.tokenIds.length === 1 ? "TOKEN" : "TOKENS";
  const role = data.role === "THREAT" ? "AMEAÇA" : "AGENTE";
  const flags = [];
  if (surprised) flags.push('<span class="flag surprised">SURPREENDIDO · NÃO AGE NA RODADA 1</span>');
  if (late) flags.push('<span class="flag late">ENTRA NA RODADA ' + data.availableFromRound + '</span>');
  if (isTie) flags.push('<span class="flag tie">EMPATE · PRECISA DESEMPATAR</span>');
  if (entry.tokenIds.length > 1) flags.push('<span class="flag group-count">' + entry.tokenIds.length + " " + memberWord + " · TESTE ÚNICO</span>");
  data.conditions.forEach((condition) => flags.push('<span class="flag condition">' + escapeHTML(condition) + "</span>"));

  const activateLabel = active ? "TURNO ATUAL" : "ATIVAR TURNO";
  const activateDisabled = !sceneState.started || !isEligibleInRound(entry, sceneState.round) || busy;
  return '<article class="operative-card ' + (active ? "is-active" : "") + '" style="--row-index:' + index + '">' +
    '<div class="operative-head">' +
      '<span class="operative-rank">' + String(index + 1).padStart(2, "0") + "</span>" +
      portraitMarkup(entry, "entry-portraits") +
      '<div class="entry-identity"><strong>' + escapeHTML(data.displayName || entry.name) + '</strong><small>' + role + " · " + escapeHTML(roleDetails(data)) + "</small></div>" +
      '<div class="entry-score ' + (data.initiative === null ? "pending" : "") + '"><span>INICIATIVA</span><strong>' + escapeHTML(score) + "</strong></div>" +
    "</div>" +
    (flags.length ? '<div class="entry-flags">' + flags.join("") + "</div>" : "") +
    '<div class="roll-detail">' + escapeHTML(rollDetails(data)) + "</div>" +
    (data.note ? '<div class="roll-detail">NOTA · ' + escapeHTML(data.note) + "</div>" : "") +
    '<div class="entry-actions">' +
      '<button class="entry-action" data-action="edit" data-id="' + escapeHTML(entry.id) + '" type="button">EDITAR</button>' +
      '<button class="entry-action current" data-action="activate" data-id="' + escapeHTML(entry.id) + '" type="button" ' + (activateDisabled ? "disabled" : "") + '>' + activateLabel + "</button>" +
      '<button class="entry-action danger" data-action="remove" data-id="' + escapeHTML(entry.id) + '" type="button">REMOVER</button>' +
    "</div>" +
  "</article>";
}

function renderParticipants(participants, ties) {
  const root = $("#initiative-list");
  if (!participants.length) {
    root.innerHTML = '<div class="empty-state"><span class="empty-mark">✣</span><b>NENHUM ENVOLVIDO REGISTRADO</b><p>Selecione tokens da camada Personagem e recrute-os para esta ocorrência.</p></div>';
    return;
  }
  root.innerHTML = participants.map((entry, index) => renderEntry(entry, index, sceneState.activeId, ties)).join("");
  bindPortraitFallback(root);
}

function renderTurn(participants) {
  const active = participants.find((entry) => entry.id === sceneState.activeId);
  $("#active-name").textContent = active ? active.combatant.displayName || active.name : "Nenhum turno ativo";
  $("#active-meta").textContent = active
    ? (active.combatant.role === "THREAT" ? "AMEAÇA" : "AGENTE") + " · Iniciativa " + active.combatant.initiative
    : sceneState.started ? "Nenhum participante pode agir neste momento." : "Inicie o combate para estabelecer a ordem.";
  const portrait = $("#active-portrait");
  if (active?.members?.length) {
    const first = active.members[0];
    const url = getPortraitUrl(first);
    portrait.innerHTML = url
      ? '<img data-portrait src="' + escapeHTML(url) + '" alt="" draggable="false">'
      : "<span>" + escapeHTML(initials(active.combatant.displayName || active.name)) + "</span>";
    bindPortraitFallback(portrait);
  } else {
    portrait.innerHTML = "<span>?</span>";
  }
  const percent = progressPercent(participants, sceneState);
  $("#progress-value").textContent = percent + "%";
  $("#progress-bar").style.width = percent + "%";
}

function render() {
  const participants = getParticipants();
  const count = participants.length;
  const ties = findInitiativeTies(participants);
  const unrolled = participants.filter((entry) => entry.combatant.initiative === null);
  const active = participants.find((entry) => entry.id === sceneState.activeId);

  $("#round-number").textContent = sceneState.started ? String(sceneState.round).padStart(2, "0") : "—";
  $("#combat-title").textContent = sceneState.started ? "CONTATO EM ANDAMENTO" : count ? "CENA PREPARADA" : "CENA NÃO INICIADA";
  $("#combat-subtitle").textContent = sceneState.started
    ? count + " registro(s) · " + sceneState.round + "ª rodada"
    : count ? "Participantes cadastrados. Revise as fichas e role a iniciativa." : "Aguardando identificação dos envolvidos.";
  $("#participant-count").textContent = String(count).padStart(2, "0") + " REGISTROS";
  $("#roll-caption").textContent = sceneState.started
    ? unrolled.length + " novo(s) envolvido(s) aguardando teste"
    : "Realizar os testes da cena · não repetir a cada rodada";
  $("#tie-caption").textContent = ties.reduce((total, group) => total + group.entries.length, 0) + " envolvidos empatados precisam rolar novamente";
  $("#resolve-ties").hidden = ties.length === 0;
  $("#resolve-ties").disabled = busy;
  $("#add-selected").disabled = busy || !sceneReady;
  $("#roll-initiative").disabled = busy || count === 0 || (sceneState.started && unrolled.length === 0);
  $("#previous-turn").disabled = busy || !sceneState.started || count === 0;
  $("#next-turn").disabled = busy || !sceneState.started || count === 0;
  $("#start-combat").hidden = sceneState.started;
  $("#end-combat").hidden = !sceneState.started;
  $("#clear-combat").disabled = busy || count === 0;
  $("#start-combat").disabled = busy || count === 0 || unrolled.length > 0 || ties.length > 0;
  $("#phase-note").textContent = !sceneReady
    ? "Abra uma cena no Owlbear Rodeo para sincronizar os registros."
    : sceneState.started
      ? "A ordem permanece fixa durante o combate. Novos envolvidos agem a partir da próxima rodada."
      : unrolled.length
        ? "Há registros sem teste de iniciativa. Revise Agilidade, treinamento e modificadores antes de iniciar."
        : ties.length
          ? "Há empates na ordem. Resolva todos antes de iniciar o combate."
          : "Ordem pronta. Inicie a cena para começar a contagem de turnos.";
  renderTurn(participants);
  renderParticipants(participants, ties);
}

async function refreshScene() {
  if (!OBR.isAvailable) return;
  const ready = await OBR.scene.isReady();
  sceneReady = ready;
  if (!ready) {
    allItems = [];
    sceneState = { ...DEFAULT_SCENE_STATE };
    setConnection(false, "SEM CENA");
    setSaving("AGUARDANDO CENA");
    render();
    return;
  }
  const [items, metadata] = await Promise.all([
    OBR.scene.items.getItems(),
    OBR.scene.getMetadata()
  ]);
  allItems = items;
  sceneState = normalizeSceneState(metadata?.[SCENE_KEY]);
  setConnection(true, "SINCRONIZADO");
  setSaving("REGISTROS SINCRONIZADOS", "saved");
  render();
}

async function persistScene(nextState) {
  const next = normalizeSceneState(nextState);
  if (OBR.isAvailable && sceneReady) {
    await OBR.scene.setMetadata({ [SCENE_KEY]: next });
  }
  sceneState = next;
  setSaving("ALTERAÇÕES REGISTRADAS", "saved");
  render();
}

async function persistCombatant(entry, values) {
  const current = normalizeCombatant(entry.combatant);
  const next = normalizeCombatant({
    ...current,
    ...values,
    groupId: entry.groupId
  });
  const mechanicalKeys = ["role", "agility", "training", "bonus", "threatBonus", "diceModifier", "threatDice"];
  const mechanicalChange = mechanicalKeys.some((key) => current[key] !== next[key]);
  if (mechanicalChange) {
    next.initiative = null;
    next.roll = null;
  }
  if (!OBR.isAvailable || !sceneReady) return;
  await OBR.scene.items.updateItems(entry.tokenIds, (draftItems) => {
    for (const item of draftItems) {
      item.metadata = item.metadata || {};
      item.metadata[ITEM_KEY] = next;
    }
  });
  allItems = allItems.map((item) => entry.tokenIds.includes(item.id)
    ? { ...item, metadata: { ...(item.metadata || {}), [ITEM_KEY]: next } }
    : item
  );
  setSaving(mechanicalChange ? "FICHA ALTERADA · TESTE PENDENTE" : "DOSSIÊ ATUALIZADO", "saved");
  render();
}

async function addSelected() {
  if (!OBR.isAvailable || !sceneReady || busy) return;
  try {
    const selectedIds = await OBR.player.getSelection();
    if (!selectedIds?.length) {
      notify("Selecione os tokens da camada Personagem primeiro.", "warning");
      return;
    }
    const selectedItems = await OBR.scene.items.getItems(selectedIds);
    pendingAdd = selectedItems.filter((item) =>
      item.type === "IMAGE" &&
      item.layer === "CHARACTER" &&
      !item.metadata?.[ITEM_KEY]
    );
    if (!pendingAdd.length) {
      notify("Nenhum token novo elegível foi selecionado.", "warning");
      return;
    }
    $("#add-count").textContent = pendingAdd.length + (pendingAdd.length === 1 ? " TOKEN" : " TOKENS");
    $("#add-role").value = "AGENT";
    $("#add-name").value = pendingAdd.length > 1 ? "Ameaças" : (pendingAdd[0].name || "Ameaça");
    $("#add-agility").value = "1";
    $("#add-training").value = "0";
    $("#add-threat-dice").value = "2";
    $("#add-threat-bonus").value = "0";
    $("#add-bonus").value = "0";
    $("#add-dice-mod").value = "0";
    $("#add-surprised").checked = false;
    toggleAddFields();
    $("#add-dialog").showModal();
  } catch (error) {
    console.error(error);
    notify("Não foi possível consultar os tokens selecionados.", "error");
  }
}

function toggleAddFields() {
  const threat = $("#add-role").value === "THREAT";
  $("#add-agent-fields").hidden = threat;
  $("#add-threat-fields").hidden = !threat;
  $("#add-name-wrap").hidden = !threat;
}

async function submitAdd(event) {
  event.preventDefault();
  if (!pendingAdd.length || busy || !sceneReady) return;
  const role = $("#add-role").value;
  const groupId = role === "THREAT" ? makeId() : null;
  const groupName = $("#add-name").value.trim() || "Ameaças";
  const agility = Number($("#add-agility").value);
  const training = Number($("#add-training").value);
  const bonus = Number($("#add-bonus").value) || 0;
  const threatBonus = Number($("#add-threat-bonus").value) || 0;
  const diceModifier = Number($("#add-dice-mod").value) || 0;
  const threatDice = Number($("#add-threat-dice").value) || 2;
  const surprised = $("#add-surprised").checked;
  const availableFromRound = sceneState.started ? sceneState.round + 1 : 1;
  const now = Date.now();
  const updates = new Map();

  for (const [index, item] of pendingAdd.entries()) {
    const id = role === "THREAT" ? groupId : item.id;
    const data = normalizeCombatant({
      role,
      groupId: id,
      groupName: role === "THREAT" ? groupName : "",
      displayName: role === "THREAT" ? groupName : item.name || "Agente",
      agility: role === "AGENT" ? agility : 1,
      training: role === "AGENT" ? training : 0,
      bonus,
      threatBonus: role === "THREAT" ? threatBonus : 0,
      diceModifier,
      threatDice,
      initiative: null,
      roll: null,
      surprised,
      availableFromRound,
      conditions: [],
      note: "",
      addedAt: now + index
    });
    updates.set(item.id, data);
  }

  busy = true;
  render();
  try {
    await OBR.scene.items.updateItems([...updates.keys()], (draftItems) => {
      for (const item of draftItems) {
        const data = updates.get(item.id);
        if (!data) continue;
        item.metadata = item.metadata || {};
        item.metadata[ITEM_KEY] = data;
      }
    });
    $("#add-dialog").close();
    pendingAdd = [];
    await refreshScene();
    const message = role === "THREAT"
      ? "Grupo de ameaças registrado como um único turno."
      : updates.size + (updates.size === 1 ? " agente registrado." : " agentes registrados.");
    notify(message, "success");
  } catch (error) {
    console.error(error);
    notify("Falha ao registrar os envolvidos. Verifique as permissões.", "error");
  } finally {
    busy = false;
    render();
  }
}

async function rollEntries(entries, message) {
  if (!entries.length || busy || !sceneReady) return;
  busy = true;
  render();
  const updates = new Map();
  const tokenIds = [];
  for (const entry of entries) {
    const result = rollInitiativeTest(entry.combatant);
    result.groupId = entry.groupId;
    result.displayName = entry.combatant.displayName || entry.name;
    for (const tokenId of entry.tokenIds) {
      updates.set(tokenId, result);
      tokenIds.push(tokenId);
    }
  }
  try {
    await OBR.scene.items.updateItems(tokenIds, (draftItems) => {
      for (const item of draftItems) {
        const data = updates.get(item.id);
        if (!data) continue;
        item.metadata = item.metadata || {};
        item.metadata[ITEM_KEY] = data;
      }
    });
    await refreshScene();
    notify(message || "Testes de Iniciativa registrados.", "success");
  } catch (error) {
    console.error(error);
    notify("Não foi possível registrar as rolagens.", "error");
  } finally {
    busy = false;
    render();
  }
}

async function rollInitiative() {
  const participants = getParticipants();
  if (!participants.length) return;
  const targets = sceneState.started
    ? participants.filter((entry) => entry.combatant.initiative === null)
    : participants;
  if (!targets.length) {
    notify("A iniciativa já foi definida. Ela permanece fixa durante as rodadas.", "warning");
    return;
  }
  await rollEntries(
    targets,
    sceneState.started ? "Iniciativa dos novos envolvidos registrada." : "Iniciativa da cena rolada."
  );
}

async function resolveTies() {
  const participants = getParticipants();
  const tied = findInitiativeTies(participants).flatMap((group) => group.entries);
  if (!tied.length) return;
  await rollEntries(tied, "Nova rolagem realizada para os envolvidos empatados.");
}

async function startCombat() {
  const participants = getParticipants();
  if (!participants.length) return;
  if (participants.some((entry) => entry.combatant.initiative === null)) {
    notify("Há registros sem teste de iniciativa.", "warning");
    return;
  }
  if (findInitiativeTies(participants).length) {
    notify("Resolva os empates antes de iniciar.", "warning");
    return;
  }
  const next = advanceTurn(participants, {
    started: true,
    round: 1,
    activeId: null
  }, 1);
  await persistScene(next);
  animateTurnChange();
  notify(next.round > 1 ? "Combate iniciado. A primeira rodada não tem ações devido à surpresa." : "Combate iniciado.", "success");
}

function animateTurnChange() {
  const banner = $("#turn-banner");
  banner.classList.remove("turn-change");
  void banner.offsetWidth;
  banner.classList.add("turn-change");
}

async function changeTurn(direction) {
  const participants = getParticipants();
  if (!sceneState.started || !participants.length || busy) return;
  const next = advanceTurn(participants, sceneState, direction);
  if (next.activeId === sceneState.activeId && next.round === sceneState.round) return;
  await persistScene(next);
  animateTurnChange();
}

async function endCombat() {
  if (!sceneState.started) return;
  if (!window.confirm("Encerrar o combate e manter os registros dos participantes?")) return;
  await persistScene({ ...sceneState, started: false, round: 1, activeId: null, changedAt: Date.now() });
  notify("Cena encerrada. Os registros foram preservados.", "success");
}

async function clearCombat() {
  const participants = getParticipants();
  if (!participants.length || busy || !sceneReady) return;
  if (!window.confirm("Apagar todos os registros de iniciativa desta cena?")) return;
  busy = true;
  render();
  try {
    const tokenIds = participants.flatMap((entry) => entry.tokenIds);
    await OBR.scene.items.updateItems(tokenIds, (draftItems) => {
      for (const item of draftItems) {
        if (item.metadata) delete item.metadata[ITEM_KEY];
      }
    });
    allItems = allItems.map((item) => {
      if (!tokenIds.includes(item.id)) return item;
      const metadata = { ...(item.metadata || {}) };
      delete metadata[ITEM_KEY];
      return { ...item, metadata };
    });
    await persistScene({ started: false, round: 1, activeId: null, changedAt: Date.now() });
    notify("Registro da ocorrência limpo.", "success");
  } catch (error) {
    console.error(error);
    notify("Não foi possível limpar os registros.", "error");
  } finally {
    busy = false;
    render();
  }
}

async function removeEntry(id) {
  const entry = getParticipants().find((candidate) => candidate.id === id);
  if (!entry || busy || !sceneReady) return;
  try {
    await OBR.scene.items.updateItems(entry.tokenIds, (draftItems) => {
      for (const item of draftItems) {
        if (item.metadata) delete item.metadata[ITEM_KEY];
      }
    });
    const removedActive = sceneState.activeId === id;
    allItems = allItems.map((item) => {
      if (!entry.tokenIds.includes(item.id)) return item;
      const metadata = { ...(item.metadata || {}) };
      delete metadata[ITEM_KEY];
      return { ...item, metadata };
    });
    if (removedActive) {
      const remaining = getParticipants();
      const next = sceneState.started
        ? advanceTurn(remaining, { ...sceneState, activeId: null }, 1)
        : { ...sceneState, activeId: null };
      await persistScene(next);
    }
    notify("Registro removido da iniciativa.", "success");
    render();
  } catch (error) {
    console.error(error);
    notify("Não foi possível remover o registro.", "error");
  }
}

function openEditor(id) {
  const entry = getParticipants().find((candidate) => candidate.id === id);
  if (!entry) return;
  editingId = id;
  const data = entry.combatant;
  $("#edit-id").value = id;
  $("#edit-name").value = data.displayName || entry.name;
  $("#edit-role-label").textContent = data.role === "THREAT" ? "GRUPO DE AMEAÇAS" : "AGENTE";
  $("#edit-agent-fields").hidden = data.role !== "AGENT";
  $("#edit-threat-fields").hidden = data.role !== "THREAT";
  $("#edit-agility").value = data.agility;
  $("#edit-training").value = String(data.training);
  $("#edit-threat-dice").value = data.threatDice;
  $("#edit-threat-bonus").value = data.threatBonus;
  $("#edit-bonus").value = data.bonus;
  $("#edit-dice-mod").value = data.diceModifier;
  $("#edit-surprised").checked = data.surprised;
  $("#edit-conditions").value = data.conditions.join(", ");
  $("#edit-note").value = data.note;
  $("#edit-roll-info").textContent = data.initiative === null
    ? "Sem resultado de iniciativa. Salvar atributos não realiza a rolagem."
    : "Resultado atual: " + data.initiative + ". Alterar os parâmetros do teste apagará este resultado.";
  $("#edit-dialog").showModal();
  $("#edit-name").focus();
}

async function submitEdit(event) {
  event.preventDefault();
  if (!editingId || busy) return;
  const entry = getParticipants().find((candidate) => candidate.id === editingId);
  if (!entry) return;
  const data = entry.combatant;
  const nextValues = {
    displayName: $("#edit-name").value.trim(),
    agility: Number($("#edit-agility").value),
    training: Number($("#edit-training").value),
    threatDice: Number($("#edit-threat-dice").value),
    threatBonus: Number($("#edit-threat-bonus").value),
    bonus: Number($("#edit-bonus").value),
    diceModifier: Number($("#edit-dice-mod").value),
    surprised: $("#edit-surprised").checked,
    conditions: $("#edit-conditions").value.split(",").map((part) => part.trim()).filter(Boolean).slice(0, 8),
    note: $("#edit-note").value.trim()
  };
  if (!nextValues.displayName) {
    notify("Informe um nome para o registro.", "warning");
    return;
  }
  try {
    await persistCombatant(entry, nextValues);
    $("#edit-dialog").close();
    editingId = null;
    notify("Dossiê atualizado.", "success");
  } catch (error) {
    console.error(error);
    notify("Não foi possível salvar o dossiê.", "error");
  }
}

async function handleEntryAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  const id = button.dataset.id;
  if (action === "edit") {
    openEditor(id);
  } else if (action === "remove") {
    await removeEntry(id);
  } else if (action === "activate") {
    if (!sceneState.started) {
      notify("Inicie o combate antes de ativar um turno.", "warning");
      return;
    }
    const next = selectTurn(getParticipants(), sceneState, id);
    if (next.activeId !== id) {
      notify("Este envolvido não pode agir nesta rodada.", "warning");
      return;
    }
    await persistScene(next);
    animateTurnChange();
  }
}

function attachListeners() {
  if (listenersAttached) return;
  listenersAttached = true;
  $("#add-selected").addEventListener("click", () => void addSelected());
  $("#add-role").addEventListener("change", toggleAddFields);
  $("#add-form").addEventListener("submit", (event) => void submitAdd(event));
  $("#close-add").addEventListener("click", () => $("#add-dialog").close());
  $("#cancel-add").addEventListener("click", () => $("#add-dialog").close());
  $("#roll-initiative").addEventListener("click", () => void rollInitiative());
  $("#resolve-ties").addEventListener("click", () => void resolveTies());
  $("#start-combat").addEventListener("click", () => void startCombat());
  $("#end-combat").addEventListener("click", () => void endCombat());
  $("#previous-turn").addEventListener("click", () => void changeTurn(-1));
  $("#next-turn").addEventListener("click", () => void changeTurn(1));
  $("#clear-combat").addEventListener("click", () => void clearCombat());
  $("#refresh").addEventListener("click", () => void refreshScene());
  $("#initiative-list").addEventListener("click", (event) => void handleEntryAction(event));
  $("#edit-form").addEventListener("submit", (event) => void submitEdit(event));
  $("#close-edit").addEventListener("click", () => $("#edit-dialog").close());
  $("#cancel-edit").addEventListener("click", () => $("#edit-dialog").close());
  $("#edit-dialog").addEventListener("close", () => { editingId = null; });
}

function setupOwlbear() {
  OBR.onReady(async () => {
    try {
      await refreshScene();
      OBR.scene.items.onChange((items) => {
        allItems = items;
        render();
      });
      OBR.scene.onMetadataChange((metadata) => {
        sceneState = normalizeSceneState(metadata?.[SCENE_KEY]);
        render();
      });
      OBR.scene.onReadyChange((ready) => {
        sceneReady = ready;
        if (ready) {
          void refreshScene();
        } else {
          allItems = [];
          sceneState = { ...DEFAULT_SCENE_STATE };
          setConnection(false, "SEM CENA");
          render();
        }
      });
    } catch (error) {
      console.error("Ordem Paranormal · Iniciativa:", error);
      setConnection(false, "FALHA DE CONEXÃO");
      notify("Não foi possível inicializar o protocolo de combate.", "error");
    }
  });
}

attachListeners();
render();
if (OBR.isAvailable) {
  setupOwlbear();
} else {
  setConnection(false, "FORA DO OWLBEAR");
  setSaving("MODO DE PRÉ-VISUALIZAÇÃO");
  $("#combat-subtitle").textContent = "Instale a extensão em uma sala do Owlbear Rodeo para sincronizar os registros.";
}