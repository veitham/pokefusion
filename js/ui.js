import {
  TIERS, byId, ballSprite, officialSprite, cryUrl, label, fusionName, fusionSpriteUrl,
} from "./data.js";
import { state } from "./store.js";

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function tierBadge(tier, withName = true) {
  return `<span class="tier-badge tier-${tier}"><img src="${ballSprite(tier)}" alt="" />${withName ? TIERS[tier].name : ""}</span>`;
}

export function itemName(item) {
  if (item.type === "fusion") return fusionName(byId.get(item.head), byId.get(item.body));
  return label(byId.get(item.id));
}

export function itemSprite(item) {
  if (item.type === "fusion") return fusionSpriteUrl(item.head, item.body, item.variant);
  return officialSprite(byId.get(item.id), item.shiny);
}

export function cardHtml(item, { count = 1, isNew = false, key = "", unknown = false } = {}) {
  const fusion = item.type === "fusion";
  const classes = ["card", `tier-${item.tier}`, fusion && "is-fusion", item.shiny && "is-shiny", unknown && "is-unknown"]
    .filter(Boolean).join(" ");
  const sub = fusion
    ? `<div class="card-sub">${label(byId.get(item.head))} + ${label(byId.get(item.body))}</div>`
    : `<div class="card-sub">#${String(byId.get(item.id).nat).padStart(3, "0")}</div>`;
  return `<div class="${classes}" data-key="${key}">
    <img class="card-ball" src="${ballSprite(item.tier)}" alt="${TIERS[item.tier].name}" title="${TIERS[item.tier].name}" />
    ${count > 1 ? `<span class="card-count">x${count}</span>` : ""}
    ${isNew ? `<span class="card-new">NOUVEAU</span>` : ""}
    ${item.shiny ? `<span class="card-shiny" title="Shiny">✦</span>` : ""}
    <div class="card-art"><img src="${itemSprite(item)}" alt="" loading="lazy" /></div>
    <div class="card-name">${unknown ? "???" : itemName(item)}</div>
    ${unknown ? "" : sub}
  </div>`;
}

const modal = $("#modal");
export function openModal(html, { onClose } = {}) {
  $(".modal-box", modal).innerHTML = `<button class="modal-close icon-btn" title="Fermer">✕</button>${html}`;
  modal.hidden = false;
  const close = () => {
    modal.hidden = true;
    document.removeEventListener("keydown", onKey);
    onClose?.();
  };
  const onKey = (e) => e.key === "Escape" && close();
  document.addEventListener("keydown", onKey);
  $(".modal-close", modal).onclick = close;
  $(".modal-backdrop", modal).onclick = close;
  return { root: $(".modal-box", modal), close };
}
export const modalOpen = () => !modal.hidden;

export function confirmModal(html, okLabel = "Confirmer") {
  return new Promise((resolve) => {
    let answered = false;
    const { root, close } = openModal(`<div class="confirm">${html}
      <div class="row"><button class="btn" data-a="no">Annuler</button>
      <button class="btn btn-red" data-a="yes">${okLabel}</button></div></div>`,
      { onClose: () => !answered && resolve(false) });
    root.querySelectorAll("[data-a]").forEach((b) => (b.onclick = () => {
      answered = true;
      close();
      resolve(b.dataset.a === "yes");
    }));
  });
}

// Ball toggles; an empty selection means "all tiers".
export function setupTierFilter(container, selected, onChange) {
  container.innerHTML = TIERS.slice(1)
    .map((t) => `<button data-t="${t.id}" title="${t.name}"><img src="${ballSprite(t.id)}" alt="${t.name}" /></button>`)
    .join("");
  container.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const t = Number(btn.dataset.t);
    selected.has(t) ? selected.delete(t) : selected.add(t);
    btn.classList.toggle("on", selected.has(t));
    onChange();
  });
}

export function toast(html, kind = "") {
  const el = document.createElement("div");
  el.className = `toast window ${kind}`;
  el.innerHTML = html;
  $("#toasts").append(el);
  setTimeout(() => el.classList.add("out"), 2600);
  setTimeout(() => el.remove(), 3000);
}

export function playCry(p) {
  if (!state.settings.sound) return;
  const audio = new Audio(cryUrl(p));
  audio.volume = 0.25;
  audio.play().catch(() => {});
}
