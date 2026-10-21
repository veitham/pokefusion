import {
  pokedex, byId, label, matches, typeBadges, statsTable, baseStats, fusionTypes, fusionStats,
} from "./data.js";
import { state, save, removeItems, creditReleases, groupItems, RELEASES_PER_PACK } from "./store.js";
import {
  $, cardHtml, tierBadge, itemName, itemSprite, openModal, confirmModal, toast, setupTierFilter,
} from "./ui.js";
import { sendToLab } from "./lab.js";

const filters = { kind: "all", tiers: new Set(), search: "", sort: "tier" };
let currentGroups = new Map();

function groupMatches(g) {
  const it = g.item;
  if (filters.kind === "mon" && it.type !== "mon") return false;
  if (filters.kind === "fusion" && it.type !== "fusion") return false;
  if (filters.tiers.size && !filters.tiers.has(it.tier)) return false;
  if (!filters.search) return true;
  if (it.type === "mon") return matches(byId.get(it.id), filters.search);
  return matches(byId.get(it.head), filters.search) || matches(byId.get(it.body), filters.search) ||
    itemName(it).toLowerCase().includes(filters.search.toLowerCase());
}

const dexNum = (it) => byId.get(it.type === "fusion" ? it.head : it.id).nat;
const SORTS = {
  tier: (a, b) => b.item.tier - a.item.tier || dexNum(a.item) - dexNum(b.item),
  recent: (a, b) => b.latest - a.latest,
  dex: (a, b) => dexNum(a.item) - dexNum(b.item) || a.item.type.localeCompare(b.item.type),
  name: (a, b) => itemName(a.item).localeCompare(itemName(b.item)),
  count: (a, b) => b.uids.length - a.uids.length || b.item.tier - a.item.tier,
};

function renderStats() {
  const seen = Object.keys(state.seen).length;
  const mons = state.items.filter((i) => i.type === "mon").length;
  const fusions = state.items.length - mons;
  const shinies = state.items.filter((i) => i.shiny).length;
  $("#collection-stats").innerHTML = `
    <div class="stat"><b>${seen}</b>/${pokedex.length}<span>Pokédex</span>
      <div class="bar"><span style="width:${(seen / pokedex.length) * 100}%"></span></div></div>
    <div class="stat"><b>${mons}</b><span>Pokémon</span></div>
    <div class="stat"><b>${fusions}</b><span>Fusions</span></div>
    <div class="stat"><b>${shinies}</b><span>Shiny ✦</span></div>
    <div class="stat"><b>${state.stats.opened}</b><span>Boosters ouverts</span></div>`;
}

function renderDex() {
  const owned = new Set(state.items.filter((i) => i.type === "mon").map((i) => i.id));
  const list = pokedex.filter((p) =>
    (!filters.tiers.size || filters.tiers.has(p.tier)) && (!filters.search || matches(p, filters.search)));
  $("#collection-grid").innerHTML = list.map((p) => {
    const seen = !!state.seen[p.id];
    return cardHtml({ type: "mon", id: p.id, tier: p.tier }, {
      key: seen ? `dex:${p.id}` : "", unknown: !seen,
    }).replace('class="card', `class="card ${seen && !owned.has(p.id) ? "is-gone" : ""}`);
  }).join("");
}

export function renderCollection() {
  renderStats();
  if (filters.kind === "dex") return renderDex();
  const groups = groupItems(state.items).filter(groupMatches).sort(SORTS[filters.sort]);
  currentGroups = new Map(groups.map((g) => [g.key, g]));
  $("#collection-grid").innerHTML = groups.length
    ? groups.map((g) => cardHtml(g.item, { count: g.uids.length, key: g.key })).join("")
    : `<div class="empty window">${state.items.length
      ? "Aucun résultat avec ces filtres."
      : "Ta collection est vide. Va ouvrir des boosters !"}</div>`;
}

function openDetail(key) {
  if (key.startsWith("dex:")) {
    const p = byId.get(Number(key.slice(4)));
    const g = groupItems(state.items).find((x) => x.item.type === "mon" && x.item.id === p.id);
    if (g) return openDetail(g.key);
    return openModal(`<div class="detail">
      <div class="detail-art tier-${p.tier}"><img src="${itemSprite({ type: "mon", id: p.id })}" alt="" /></div>
      <h2>${label(p)}</h2>${tierBadge(p.tier)}${typeBadges(p.types)}
      <p class="muted">Déjà capturé, mais plus dans ta collection (relâché ou fusionné).</p></div>`);
  }
  const g = currentGroups.get(key) || groupItems(state.items).find((x) => x.key === key);
  if (!g) return;
  const it = g.item;
  const fusion = it.type === "fusion";
  const head = fusion && byId.get(it.head), body = fusion && byId.get(it.body);
  const p = !fusion && byId.get(it.id);
  const types = fusion ? fusionTypes(head, body) : p.types;
  const stats = fusion ? fusionStats(head, body) : baseStats(p);
  const credit = fusion
    ? (it.variant === null ? "Sprite auto-généré" : `Sprite par <b>${it.artist || "artiste inconnu"}</b>`)
    : "";

  const { root, close } = openModal(`<div class="detail">
    <div class="detail-art tier-${it.tier} ${it.shiny ? "is-shiny" : ""}"><img src="${itemSprite(it)}" alt="" /></div>
    <h2>${itemName(it)} ${it.shiny ? '<span class="shiny-star">✦</span>' : ""}</h2>
    ${tierBadge(it.tier)}
    ${fusion ? `<p class="muted">${label(head)} (tête) + ${label(body)} (corps)<br/>${credit}</p>` : ""}
    ${typeBadges(types)}
    ${statsTable(stats)}
    <p class="muted">Possédé${g.uids.length > 1 ? "s" : ""} : x${g.uids.length}</p>
    <div class="row">
      ${fusion ? "" : `<button class="btn" data-a="head">Labo : tête</button><button class="btn" data-a="body">Labo : corps</button>`}
      <button class="btn btn-red" data-a="release">Relâcher 1</button>
    </div></div>`);

  root.querySelectorAll("[data-a]").forEach((b) => (b.onclick = async () => {
    if (b.dataset.a === "release") {
      close();
      const name = itemName(it);
      if (!(await confirmModal(`Relâcher <b>${name}</b> ?`, "Relâcher"))) return;
      removeItems([g.uids[g.uids.length - 1]]);
      const packs = creditReleases(1);
      save();
      toast(`${name} a été relâché.${packs ? ` +${packs} booster !` : ""}`);
      return;
    }
    close();
    sendToLab(b.dataset.a, g.uids[0]);
  }));
}

async function releaseDuplicates() {
  const extra = groupItems(state.items)
    .filter((g) => g.item.type === "mon" && !g.item.shiny && g.uids.length > 1)
    .flatMap((g) => g.uids.slice(1));
  if (!extra.length) return toast("Aucun doublon à relâcher.");
  const credit = state.releaseCredit + extra.length;
  const ok = await confirmModal(
    `Relâcher <b>${extra.length}</b> doublon${extra.length > 1 ? "s" : ""} ?<br/>
    <span class="muted">Tu gardes 1 exemplaire de chaque Pokémon, les shiny et les fusions ne sont pas touchés.
    1 booster offert tous les ${RELEASES_PER_PACK} relâchés (≈ +${Math.floor(credit / RELEASES_PER_PACK)}).</span>`,
    "Relâcher");
  if (!ok) return;
  removeItems(extra);
  const packs = creditReleases(extra.length);
  save();
  toast(`${extra.length} doublons relâchés. +${packs} booster${packs > 1 ? "s" : ""} !`);
}

export function initCollection() {
  $("#col-search").addEventListener("input", (e) => { filters.search = e.target.value; renderCollection(); });
  $("#col-sort").addEventListener("change", (e) => { filters.sort = e.target.value; renderCollection(); });
  $("#col-kind").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    filters.kind = btn.dataset.v;
    $("#col-kind").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === btn));
    renderCollection();
  });
  setupTierFilter($("#col-tiers"), filters.tiers, renderCollection);
  $("#release-dupes").addEventListener("click", releaseDuplicates);
  $("#collection-grid").addEventListener("click", (e) => {
    const card = e.target.closest(".card[data-key]");
    if (card?.dataset.key) openDetail(card.dataset.key);
  });
}