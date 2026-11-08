import OBR from "https://esm.sh/@owlbear-rodeo/sdk@3.1.0";
import {
  DEFAULT_SCENE_STATE,
  normalizeCombatant,
  normalizeSceneState,
  sortCombatants,
  advanceTurn,
  selectTurn,
  rollD20,
  progressPercent,
  initials
} from "./core.js?v=1.0.0";

const EXTENSION_ID = "com.onze1onze.sistema-iniciativa";
const ITEM_KEY = EXTENSION_ID + "/combatant";
const SCENE_KEY = EXTENSION_ID + "/combat";
const $ = (selector) => document.querySelector(selector);

let allItems = [];
let sceneState = { ...DEFAULT_SCENE_STATE };
let editingId = null;
let busy = false;
let sceneReady = false;
let toastTimer = null;
let saveQueue = Promise.resolve();

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function getParticipants() {
  const participants = [];
  for (const item of allItems) {
    if (item.layer !== "CHARACTER") continue;
    const raw = item.metadata?.[ITEM_KEY];
    if (!raw) continue;
    participants.push({
      id: item.id,
      name: item.name || "Combatente",
      combatant: normalizeCombatant(raw)
    });
  }
  return sortCombatants(participants);
}

function notify(message, kind = "info") {
  const toast = $("#toast");
  toast.textContent = message;
  toast.className = "toast visible " + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2900);
}

function setConnection(connected, label) {
  $("#connection").classList.toggle("connected", connected);
  $("#connection").innerHTML = "<i></i> " + escapeHTML(label);
}

function setSaving(label, state = "") {
  $("#save-state").textContent = label;
  $("#save-state").dataset.state = state;
}

function animateTurnChange() {
  const banner = $("#turn-banner");
  banner.classList.remove("turn-change");
  void banner.offsetWidth;
  banner.classList.add("turn-change");
}

function render() {
  const participants = getParticipants();
  const count = participants.length;
  const active = participants.find((entry) => entry.id === sceneState.activeId);
  const activeIndex = participants.findIndex((entry) => entry.id === sceneState.activeId);
  const percent = progressPercent(participants, sceneState);

  $("#round-number").textContent = sceneState.started ? String(sceneState.round).padStart(2, "0") : "—";
  $("#combat-state").textContent = sceneState.started ? "EM ANDAMENTO" : count ? "PREPARADO" : "INATIVO";
  $("#combat-state").className = "state-pill " + (sceneState.started ? "is-live" : count ? "is-ready" : "is-idle");
  $("#combat-title").textContent = sceneState.started ? "Encontro em andamento" : count ? "Encontro preparado" : "Preparação do encontro";
  $("#combat-subtitle").textContent = sceneState.started
    ? count + " combatente(s) na ordem · Rodada " + sceneState.round
    : count ? "Ordem definida. Inicie o combate quando estiver pronto." : "Adicione personagens para organizar a ordem de ação.";
  $("#active-name").textContent = active ? active.combatant.displayName || active.name : "Nenhum combatente ativo";
  $("#active-meta").textContent = active
    ? "Iniciativa " + active.combatant.initiative + " · Posição " + (activeIndex + 1) + " de " + count
    : "Inicie o encontro para definir o primeiro turno.";
  $("#progress-value").textContent = percent + "%";
  $("#progress-bar").style.width = percent + "%";
  $("#timeline-count").textContent = count + (count === 1 ? " PARTICIPANTE" : " PARTICIPANTES");
  $("#combatant-count").textContent = count + " NA ORDEM";
  $("#start-combat").disabled = count === 0 || busy;
  $("#next-turn").disabled = count === 0 || busy || !sceneState.started;
  $("#previous-turn").disabled = count === 0 || busy || !sceneState.started;
  $("#add-selected").disabled = busy || !sceneReady;
  $("#roll-all").disabled = count === 0 || busy;
  $("#clear-combat").disabled = count === 0 || busy;
  $("#start-combat").innerHTML = sceneState.started ? "Reiniciar combate <span>↺</span>" : "Iniciar combate <span>▶</span>";

  renderTimeline(participants, active);
  renderCombatants(participants, active);
}

function renderTimeline(participants, active) {
  const root = $("#timeline");
  if (!participants.length) {
    root.innerHTML = '<div class="empty-timeline"><span>✧</span> A linha de iniciativa aparecerá aqui.</div>';
    return;
  }

  root.innerHTML = participants.map((entry, index) => {
    const isActive = entry.id === active?.id;
    const display = entry.combatant.displayName || entry.name;
    const conditions = entry.combatant.conditions.length
      ? '<span class="timeline-condition">' + escapeHTML(entry.combatant.conditions[0]) + '</span>'
      : "";
    return '<button class="timeline-card ' + (isActive ? "is-active" : "") + '" type="button" data-action="activate" data-id="' + escapeHTML(entry.id) + '" style="--card-index:' + index + '" title="Ativar turno de ' + escapeHTML(display) + '">' +
      '<span class="timeline-top"><span class="timeline-number">' + String(index + 1).padStart(2, "0") + '</span><span class="timeline-initiative">' + escapeHTML(entry.combatant.initiative) + '</span></span>' +
      '<span class="timeline-avatar">' + escapeHTML(initials(display)) + '</span>' +
      '<span class="timeline-name">' + escapeHTML(display) + '</span>' + conditions +
      (isActive ? '<span class="active-marker">AGORA</span>' : "") +
    '</button>';
  }).join('<span class="timeline-connector" aria-hidden="true">›</span>');
}

function renderCombatants(participants, active) {
  const root = $("#combatant-list");
  if (!participants.length) {
    root.innerHTML = '<div class="empty-state"><div class="empty-glyph">✧</div><strong>Nenhum participante registrado</strong><p>Selecione tokens da camada Personagem e adicione-os ao encontro.</p></div>';
    return;
  }

  root.innerHTML = participants.map((entry, index) => {
    const data = entry.combatant;
    const display = data.displayName || entry.name;
    const conditions = data.conditions.length
      ? data.conditions.map((condition) => '<span class="condition-chip">' + escapeHTML(condition) + '</span>').join("")
      : '<span class="no-condition">—</span>';
    const isActive = entry.id === active?.id;
    return '<article class="combatant-row ' + (isActive ? "is-active" : "") + '" data-id="' + escapeHTML(entry.id) + '" style="--row-index:' + index + '">' +
      '<div class="combatant-identity"><span class="rank-badge">' + String(index + 1).padStart(2, "0") + '</span><span class="combatant-avatar">' + escapeHTML(initials(display)) + '</span><span class="combatant-names"><strong>' + escapeHTML(display) + '</strong><small>' + (isActive ? '<i class="live-dot"></i> TURNO ATUAL' : escapeHTML(entry.name)) + '</small></span></div>' +
      '<div class="initiative-cell"><strong>' + escapeHTML(data.initiative) + '</strong><small>INICIATIVA</small></div>' +
      '<div class="conditions-cell">' + conditions + '</div>' +
      '<div class="row-actions"><button class="row-action" data-action="activate" data-id="' + escapeHTML(entry.id) + '" type="button" title="Definir turno atual">▶</button><button class="row-action" data-action="edit" data-id="' + escapeHTML(entry.id) + '" type="button" title="Editar combatente">✎</button><button class="row-action danger" data-action="remove" data-id="' + escapeHTML(entry.id) + '" type="button" title="Remover da iniciativa">×</button></div>' +
    '</article>' +
    (data.note ? '<div class="combatant-note"><span>NOTA</span> ' + escapeHTML(data.note) + '</div>' : "");
  }).join("");
}

async function refreshScene() {
  if (!OBR.isAvailable) return;
  const ready = await OBR.scene.isReady();
  sceneReady = ready;
  if (!ready) {
    allItems = [];
    sceneState = { ...DEFAULT_SCENE_STATE };
    setConnection(false, "Sem cena");
    setSaving("Abra uma cena para usar a iniciativa");
    render();
    return;
  }
  const [items, metadata] = await Promise.all([
    OBR.scene.items.getItems(),
    OBR.scene.getMetadata()
  ]);
  allItems = items;
  sceneState = normalizeSceneState(metadata?.[SCENE_KEY]);
  setConnection(true, "Sincronizado");
  setSaving("Dados sincronizados com a cena", "saved");
  render();
}

function enqueueSave(task) {
  saveQueue = saveQueue.then(task).catch((error) => {
    console.error("Sistema Iniciativa:", error);
    setSaving("Falha ao salvar", "error");
    notify("Não foi possível salvar. Verifique as permissões da sala.", "error");
  });
  return saveQueue;
}

async function saveSceneState(nextState) {
  const state = normalizeSceneState(nextState);
  await enqueueSave(async () => {
    await OBR.scene.setMetadata({ [SCENE_KEY]: state });
    sceneState = state;
    setSaving("Alterações salvas", "saved");
    render();
  });
}

async function updateCombatant(id, updater) {
  if (busy) return;
  busy = true;
  render();
  try {
    await OBR.scene.items.updateItems([id], (draftItems) => {
      for (const item of draftItems) {
        const current = normalizeCombatant(item.metadata?.[ITEM_KEY]);
        item.metadata = item.metadata || {};
        item.metadata[ITEM_KEY] = normalizeCombatant(updater(current));
      }
    });
    setSaving("Alterações salvas", "saved");
  } catch (error) {
    console.error(error);
    notify("Não foi possível atualizar esse personagem.", "error");
  } finally {
    busy = false;
    render();
  }
}

async function addItemsToInitiative(items) {
  const candidates = items.filter((item) => item.layer === "CHARACTER" && item.type === "IMAGE");
  if (!candidates.length) {
    notify("Selecione ao menos um token da camada Personagem.", "warning");
    return;
  }
  const ids = candidates.map((item) => item.id);
  let added = 0;
  try {
    await OBR.scene.items.updateItems(ids, (draftItems) => {
      for (const item of draftItems) {
        if (item.metadata?.[ITEM_KEY]) continue;
        item.metadata = item.metadata || {};
        item.metadata[ITEM_KEY] = {
          initiative: rollD20(),
          displayName: item.name || "Combatente",
          conditions: [],
          note: "",
          addedAt: Date.now()
        };
        added += 1;
      }
    });
    notify(added ? added + (added === 1 ? " combatente adicionado." : " combatentes adicionados.") : "Os tokens selecionados já estão na iniciativa.", "success");
  } catch (error) {
    console.error(error);
    notify("Não foi possível adicionar os tokens. Verifique as permissões.", "error");
  }
}

async function addSelected() {
  try {
    const selectedIds = await OBR.player.getSelection();
    if (!selectedIds?.length) {
      notify("Selecione os tokens dos personagens primeiro.", "warning");
      return;
    }
    const selectedItems = await OBR.scene.items.getItems(selectedIds);
    await addItemsToInitiative(selectedItems);
  } catch (error) {
    console.error(error);
    notify("Não foi possível ler a seleção atual.", "error");
  }
}

async function removeCombatant(id) {
  try {
    await OBR.scene.items.updateItems([id], (draftItems) => {
      for (const item of draftItems) {
        if (item.metadata) delete item.metadata[ITEM_KEY];
      }
    });
    if (sceneState.activeId === id) {
      const remaining = getParticipants().filter((entry) => entry.id !== id);
      await saveSceneState({ ...sceneState, activeId: remaining[0]?.id || null, started: remaining.length > 0 && sceneState.started, changedAt: Date.now() });
    }
    notify("Combatente removido da ordem.", "success");
  } catch (error) {
    console.error(error);
    notify("Não foi possível remover o combatente.", "error");
  }
}

async function changeTurn(direction) {
  const participants = getParticipants();
  if (!participants.length || busy) return;
  const previousId = sceneState.activeId;
  const next = advanceTurn(participants, sceneState, direction);
  await saveSceneState(next);
  if (next.activeId !== previousId) animateTurnChange();
}

async function startCombat() {
  const participants = getParticipants();
  if (!participants.length) return;
  const next = advanceTurn(participants, { ...sceneState, activeId: null, round: 1 }, 1);
  await saveSceneState({ ...next, round: 1 });
  animateTurnChange();
  notify("Encontro iniciado.", "success");
}

async function rollAll() {
  if (busy) return;
  const ids = getParticipants().map((entry) => entry.id);
  if (!ids.length) return;
  busy = true;
  render();
  try {
    await OBR.scene.items.updateItems(ids, (draftItems) => {
      for (const item of draftItems) {
        const data = normalizeCombatant(item.metadata?.[ITEM_KEY]);
        item.metadata[ITEM_KEY] = { ...data, initiative: rollD20() };
      }
    });
    const latest = await OBR.scene.items.getItems();
    allItems = latest;
    const sorted = getParticipants();
    const first = sorted[0];
    await saveSceneState({
      ...sceneState,
      activeId: first?.id || null,
      started: sceneState.started,
      changedAt: Date.now()
    });
    notify("Iniciativas roladas novamente.", "success");
  } catch (error) {
    console.error(error);
    notify("Falha ao rolar as iniciativas.", "error");
  } finally {
    busy = false;
    render();
  }
}

async function clearCombat() {
  const participants = getParticipants();
  if (!participants.length) return;
  if (!window.confirm("Remover todos os combatentes e encerrar este encontro?")) return;
  const ids = participants.map((entry) => entry.id);
  try {
    await OBR.scene.items.updateItems(ids, (draftItems) => {
      for (const item of draftItems) if (item.metadata) delete item.metadata[ITEM_KEY];
    });
    await saveSceneState({ started: false, round: 1, activeId: null, changedAt: Date.now() });
    notify("Encontro limpo.", "success");
  } catch (error) {
    console.error(error);
    notify("Não foi possível limpar o encontro.", "error");
  }
}

function openEditor(id) {
  const participant = getParticipants().find((entry) => entry.id === id);
  if (!participant) return;
  editingId = id;
  $("#edit-id").value = id;
  $("#edit-name").value = participant.combatant.displayName || participant.name;
  $("#edit-initiative").value = participant.combatant.initiative;
  $("#edit-conditions").value = participant.combatant.conditions.join(", ");
  $("#edit-note").value = participant.combatant.note;
  $("#edit-dialog").showModal();
  $("#edit-name").focus();
}

async function saveEditor(event) {
  event.preventDefault();
  if (!editingId) return;
  const name = $("#edit-name").value.trim();
  const initiative = Number($("#edit-initiative").value);
  if (!name || !Number.isFinite(initiative)) return;
  const conditions = $("#edit-conditions").value.split(",").map((part) => part.trim()).filter(Boolean).slice(0, 8);
  const note = $("#edit-note").value.trim();
  const id = editingId;
  await updateCombatant(id, (current) => ({ ...current, displayName: name, initiative, conditions, note }));
  $("#edit-dialog").close();
  editingId = null;
}

async function handleListAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const { action, id } = button.dataset;
  if (action === "activate") {
    const next = selectTurn(getParticipants(), sceneState, id);
    await saveSceneState(next);
    animateTurnChange();
  } else if (action === "edit") {
    openEditor(id);
  } else if (action === "remove") {
    await removeCombatant(id);
  }
}

function attachListeners() {
  $("#add-selected").addEventListener("click", () => void addSelected());
  $("#start-combat").addEventListener("click", () => {
    if (sceneState.started) void startCombat();
    else void startCombat();
  });
  $("#next-turn").addEventListener("click", () => void changeTurn(1));
  $("#previous-turn").addEventListener("click", () => void changeTurn(-1));
  $("#roll-all").addEventListener("click", () => void rollAll());
  $("#clear-combat").addEventListener("click", () => void clearCombat());
  $("#refresh").addEventListener("click", () => void refreshScene());
  $("#timeline").addEventListener("click", (event) => void handleListAction(event));
  $("#combatant-list").addEventListener("click", (event) => void handleListAction(event));
  $("#edit-form").addEventListener("submit", (event) => void saveEditor(event));
  $("#close-dialog").addEventListener("click", () => $("#edit-dialog").close());
  $("#cancel-edit").addEventListener("click", () => $("#edit-dialog").close());
  $("#edit-dialog").addEventListener("close", () => { editingId = null; });
}

function setupOwlbear() {
  OBR.onReady(async () => {
    try {
      attachListeners();
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
        if (ready) void refreshScene();
        else {
          allItems = [];
          sceneState = { ...DEFAULT_SCENE_STATE };
          render();
          setConnection(false, "Sem cena");
        }
      });
    } catch (error) {
      console.error("Falha na inicialização:", error);
      setConnection(false, "Falha de conexão");
      notify("Não foi possível iniciar a extensão nesta sala.", "error");
    }
  });
}

attachListenersFallback();
function attachListenersFallback() {
  if (!OBR.isAvailable) {
    setConnection(false, "Fora do Owlbear");
    $("#combat-subtitle").textContent = "Instale esta extensão em uma sala do Owlbear Rodeo para sincronizar os turnos.";
    setSaving("Modo de pré-visualização");
    render();
    attachListeners();
  } else {
    setupOwlbear();
  }
}