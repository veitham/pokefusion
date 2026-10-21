import {
  byId, label, matches, ballSprite, officialSprite, fusionOptions, fusionSpriteUrl, fusionName, fusionTypes,
  fusionStats, fusionTier, typeBadges, statsTable, getSpriteIndex,
} from "./data.js";
import { state, save, addItem, removeItems, groupItems } from "./store.js";
import { $, $$, cardHtml, tierBadge, openModal, toast, playCry, wait, setupTierFilter } from "./ui.js";

const slots = { head: null, body: null };
let activeSlot = "head";
let fusing = false;
const filters = { search: "", tiers: new Set(), onlyDrawn: false };
// headId -> sprite index, filled lazily so the box can show which pairs have drawn sprites.
const indexes = new Map();

const itemByUid = (uid) => state.items.find((i) => i.uid === uid);

function cleanSlots() {
  for (const s of ["head", "body"]) {
    if (slots[s] !== null && !itemByUid(slots[s])) slots[s] = null;
  }
}

export function sendToLab(slot, uid) {
  slots[slot] = uid;
  if (slots[slot === "head" ? "body" : "head"] === uid) slots[slot === "head" ? "body" : "head"] = null;
  activeSlot = slot === "head" ? "body" : "head";
  location.hash = "#lab";
  renderLab();
}

const loading = new Set();
let boxRenderQueued = false;
function loadIndex(headId) {
  if (loading.has(headId)) return;
  loading.add(headId);
  getSpriteIndex(headId).then((index) => {
    indexes.set(headId, index);
    if (!boxRenderQueued) {
      boxRenderQueued = true;
      requestAnimationFrame(() => { boxRenderQueued = false; renderBox(); });
    }
  });
}

// Pair availability: drawn sprite count, or "auto", or "none". Null while loading.
function pairStatus(headId, bodyId) {
  const index = indexes.get(headId);
  if (!index) {
    loadIndex(headId);
    return null;
  }
  const drawn = Object.keys(index[bodyId] || {}).length;
  if (drawn) return { drawn };
  return headId <= 501 && bodyId <= 501 ? { auto: true } : { none: true };
}

function boxGroups() {
  const used = [slots.head, slots.body].filter((u) => u !== null);
  return groupItems(state.items.filter((i) => i.type === "mon"))
    .map((g) => ({ ...g, free: g.uids.filter((u) => !used.includes(u)) }))
    .filter((g) => g.free.length > 0);
}

function renderBox() {
  const head = slots.head !== null && itemByUid(slots.head);
  const body = slots.body !== null && itemByUid(slots.body);
  // Hints are relative to the filled slot when exactly one is filled.
  const other = head && !body ? { item: head, as: "head" } : body && !head ? { item: body, as: "body" } : null;

  const groups = boxGroups()
    .filter((g) => !filters.tiers.size || filters.tiers.has(g.item.tier))
    .filter((g) => !filters.search || matches(byId.get(g.item.id), filters.search))
    .map((g) => {
      if (!other) return { g, status: null };
      const status = other.as === "head" ? pairStatus(other.item.id, g.item.id) : pairStatus(g.item.id, other.item.id);
      return { g, status };
    })
    .filter(({ status }) => !filters.onlyDrawn || !other || status?.drawn)
    .sort((a, b) => (b.status?.drawn || 0) - (a.status?.drawn || 0) || b.g.item.tier - a.g.item.tier ||
      byId.get(a.g.item.id).nat - byId.get(b.g.item.id).nat);

  $("#lab-list").innerHTML = groups.length ? groups.map(({ g, status }) => {
    const p = byId.get(g.item.id);
    const hint = !status ? "" : status.drawn ? `<span class="hint-drawn" title="Sprites dessinés">✦${status.drawn}</span>`
      : status.auto ? `<span class="hint-auto" title="Seulement le sprite auto-généré">auto</span>`
      : `<span class="hint-none" title="Aucun sprite : fusion impossible">✕</span>`;
    return `<button class="box-row tier-${g.item.tier} ${status?.none ? "dim" : ""}" data-key="${g.key}">
      <img class="box-ball" src="${ballSprite(g.item.tier)}" alt="" />
      <img class="box-sprite" src="${officialSprite(p, g.item.shiny)}" alt="" loading="lazy" />
      <span class="box-name">${label(p)}${g.item.shiny ? " ✦" : ""}</span>
      ${hint}
      <span class="box-count">x${g.free.length}</span></button>`;
  }).join("") : `<p class="muted center">${state.items.some((i) => i.type === "mon")
    ? "Aucun Pokémon ne correspond." : "Ta boîte est vide : ouvre des boosters !"}</p>`;
}

function renderCapsules() {
  for (const s of ["head", "body"]) {
    const cap = $(`.capsule[data-slot="${s}"]`);
    const it = slots[s] !== null && itemByUid(slots[s]);
    cap.classList.toggle("active", activeSlot === s);
    cap.classList.toggle("filled", !!it);
    cap.className = cap.className.replace(/\btier-\d\b/g, "").trim() + (it ? ` tier-${it.tier}` : "");
    $(".capsule-glass", cap).innerHTML = it
      ? `<img src="${officialSprite(byId.get(it.id), it.shiny)}" alt="" /><div class="capsule-name">${label(byId.get(it.id))}</div>`
      : `<div class="capsule-empty">Choisis un Pokémon<br/>dans ta boîte</div>`;
  }
}

let previewToken = 0;
async function renderPreview() {
  const head = slots.head !== null && itemByUid(slots.head);
  const body = slots.body !== null && itemByUid(slots.body);
  const btn = $("#lab-fuse");
  if (!head || !body) {
    btn.disabled = true;
    $("#lab-preview").innerHTML = `<p class="muted center">Place une tête et un corps dans les capsules.</p>`;
    return;
  }
  const token = ++previewToken;
  const h = byId.get(head.id), b = byId.get(body.id);
  const opts = await fusionOptions(h.id, b.id);
  if (token !== previewToken) return;
  const tier = fusionTier(head.tier, body.tier);
  const possible = opts.custom.length > 0 || opts.auto;
  const teaser = opts.custom.length
    ? fusionSpriteUrl(h.id, b.id, opts.custom[0].variant)
    : opts.auto ? fusionSpriteUrl(h.id, b.id, null) : null;
  const spriteInfo = opts.custom.length
    ? `<span class="ok">✦ ${opts.custom.length} sprite${opts.custom.length > 1 ? "s" : ""} dessiné${opts.custom.length > 1 ? "s" : ""} possible${opts.custom.length > 1 ? "s" : ""}</span>`
    : opts.auto ? `<span class="warn">Seulement le sprite auto-généré</span>`
    : `<span class="bad">✕ Aucun sprite pour cette fusion, impossible</span>`;

  $("#lab-preview").innerHTML = `<div class="preview-grid">
    <div class="teaser tier-${tier}">${teaser ? `<img src="${teaser}" alt="" />` : "?"}<span>?</span></div>
    <div>
      <h3>${fusionName(h, b)}</h3>
      ${tierBadge(tier)}
      ${typeBadges(fusionTypes(h, b))}
      <p>${spriteInfo}</p>
      ${head.shiny || body.shiny ? `<p class="ok">✦ La fusion sera shiny</p>` : ""}
    </div>
    ${statsTable(fusionStats(h, b))}
  </div>`;
  btn.disabled = !possible || fusing;
}

export function renderLab() {
  cleanSlots();
  renderCapsules();
  renderBox();
  renderPreview();
}

async function fuse() {
  const head = itemByUid(slots.head), body = itemByUid(slots.body);
  if (!head || !body || fusing) return;
  const h = byId.get(head.id), b = byId.get(body.id);
  const opts = await fusionOptions(h.id, b.id);
  // Random hand-drawn sprite; the auto-generated one only when nothing was drawn.
  const pick = opts.custom.length ? opts.custom[Math.floor(Math.random() * opts.custom.length)] : opts.auto ? null : undefined;
  if (pick === undefined) return;

  fusing = true;
  $("#lab-fuse").disabled = true;
  $(".lab-machine").classList.add("fusing");
  await wait(1400);

  removeItems([head.uid, body.uid]);
  const fusion = addItem({
    type: "fusion", head: h.id, body: b.id,
    variant: pick ? pick.variant : null, artist: pick ? pick.artist : "",
    tier: fusionTier(head.tier, body.tier), shiny: head.shiny || body.shiny,
  });
  state.stats.fusions++;
  slots.head = slots.body = null;
  activeSlot = "head";
  save();

  $(".lab-machine").classList.remove("fusing");
  $(".lab-machine").classList.add("flash");
  setTimeout(() => $(".lab-machine").classList.remove("flash"), 600);
  fusing = false;
  renderLab();
  playCry(b);

  const variantText = pick === null ? "Sprite auto-généré"
    : `Sprite ${pick.variant ? `alternatif ${pick.variant.toUpperCase()}` : "principal"} par <b>${pick.artist || "artiste inconnu"}</b>
       (${opts.custom.length} possible${opts.custom.length > 1 ? "s" : ""})`;
  const reveal = openModal(`<div class="fusion-reveal">
    <h2>Fusion réussie !</h2>
    <div class="reveal-card pop">${cardHtml(fusion)}</div>
    ${typeBadges(fusionTypes(h, b))}
    <p class="muted">${variantText}</p>
    <div class="row"><a class="btn" href="#collection" data-close>Voir la collection</a>
    <button class="btn btn-red" data-close>Continuer</button></div></div>`);
  reveal.root.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", reveal.close));
  if (fusion.tier >= 4) toast(`${tierBadge(fusion.tier, false)} Fusion <b>${fusionName(h, b)}</b> !`, "legend");
}

export function initLab() {
  $("#lab-search").addEventListener("input", (e) => { filters.search = e.target.value; renderBox(); });
  $("#lab-only-drawn").addEventListener("change", (e) => { filters.onlyDrawn = e.target.checked; renderBox(); });
  setupTierFilter($("#lab-tiers"), filters.tiers, renderBox);

  $("#lab-list").addEventListener("click", (e) => {
    const row = e.target.closest(".box-row");
    if (!row) return;
    const g = boxGroups().find((x) => x.key === row.dataset.key);
    if (!g) return;
    slots[activeSlot] = g.free[0];
    const other = activeSlot === "head" ? "body" : "head";
    if (slots[other] === null) activeSlot = other;
    renderLab();
    // On narrow screens the box is below the machine.
    if (slots.head !== null && slots.body !== null && matchMedia("(max-width: 860px)").matches) {
      $(".lab-machine").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  $$(".capsule").forEach((cap) => {
    cap.addEventListener("click", (e) => {
      if (e.target.closest(".capsule-clear")) {
        slots[cap.dataset.slot] = null;
      }
      activeSlot = cap.dataset.slot;
      renderLab();
    });
  });
  $("#lab-swap").addEventListener("click", () => {
    [slots.head, slots.body] = [slots.body, slots.head];
    renderLab();
  });
  $("#lab-fuse").addEventListener("click", fuse);
}
