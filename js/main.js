import { loadPokedex } from "./data.js";
import { state, save, subscribe, tickPacks, reset } from "./store.js";
import { $, $$, confirmModal } from "./ui.js";
import { initBooster, renderCounters } from "./booster.js";
import { initCollection, renderCollection } from "./collection.js";
import { initLab, renderLab } from "./lab.js";
import { initSimulator } from "./simulator.js";

const TABS = ["booster", "collection", "lab", "fusiodex"];
const RENDERERS = { collection: renderCollection, lab: renderLab };

const currentTab = () => (TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "booster");

function showTab() {
  const tab = currentTab();
  for (const t of TABS) $(`#tab-${t}`).hidden = t !== tab;
  $$(".tabs a").forEach((a) => a.classList.toggle("on", a.dataset.tab === tab));
  RENDERERS[tab]?.();
}

function renderSound() {
  $("#sound-toggle").textContent = state.settings.sound ? "🔊" : "🔇";
}

async function init() {
  await loadPokedex();
  tickPacks();

  initBooster();
  initCollection();
  initLab();
  initSimulator();

  subscribe(() => {
    renderCounters();
    const tab = currentTab();
    if (tab === "collection") renderCollection();
  });

  $("#sound-toggle").addEventListener("click", () => {
    state.settings.sound = !state.settings.sound;
    save();
    renderSound();
  });
  $("#reset-save").addEventListener("click", async () => {
    if (await confirmModal("Réinitialiser la partie ?<br/><span class=\"muted\">Toute ta collection sera perdue.</span>", "Tout effacer")) reset();
  });

  window.addEventListener("hashchange", showTab);
  setInterval(() => { tickPacks(); renderCounters(); }, 250);
  renderSound();
  showTab();
}

init();
