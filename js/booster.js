import { TIERS, SHINY_ODDS, byTier, byId, ballSprite, label } from "./data.js";
import { state, save, addItem, PACK_SIZE, PACK_INTERVAL, MAX_PACKS, nextPackIn } from "./store.js";
import { $, cardHtml, tierBadge, toast, playCry, wait, modalOpen } from "./ui.js";

let busy = false;
const justRevealed = new Set();

function rollTier() {
  const total = TIERS.slice(1).reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * total;
  for (const t of TIERS.slice(1)) {
    if ((r -= t.weight) < 0) return t.id;
  }
  return 1;
}

function rollBall() {
  const tier = rollTier();
  const pool = byTier[tier];
  const mon = pool[Math.floor(Math.random() * pool.length)];
  return { tier, id: mon.id, shiny: Math.random() < SHINY_ODDS, opened: false };
}

const unopened = () => state.pending.filter((b) => !b.opened).length;

function openPack() {
  if (busy || state.packs <= 0 || unopened() > 0) return;
  state.packs--;
  // Rarest balls last, for the suspense.
  state.pending = Array.from({ length: PACK_SIZE }, rollBall).sort((a, b) => a.tier - b.tier);
  state.stats.opened++;
  save();
  renderShelf();
}

// Opens several balls at once: they shake together, then all cards pop.
async function revealBalls(indices) {
  indices = indices.filter((i) => state.pending[i] && !state.pending[i].opened);
  if (busy || !indices.length) return;
  busy = true;
  const slots = indices.map((i) => $(`#shelf [data-i="${i}"]`));
  slots.forEach((s) => s.classList.add("shake"));
  await wait(450);
  slots.forEach((s) => s.classList.add("flash"));
  await wait(100);

  for (const i of indices) {
    const ball = state.pending[i];
    ball.opened = true;
    ball.isNew = !state.seen[ball.id];
    state.seen[ball.id] = true;
    state.stats.balls++;
    addItem({ type: "mon", id: ball.id, shiny: ball.shiny, tier: ball.tier });
    justRevealed.add(i);
  }
  save();
  renderShelf();
  busy = false;

  const balls = indices.map((i) => state.pending[i]);
  const best = balls.reduce((a, b) => (b.shiny || b.tier > a.tier ? b : a));
  if (best.tier >= 3 || best.shiny) playCry(byId.get(best.id));
  for (const ball of balls) {
    const mon = byId.get(ball.id);
    if (ball.shiny) toast(`✦ <b>${label(mon)}</b> shiny !`, "shiny");
    else if (ball.tier === 5) toast(`${tierBadge(5, false)} <b>${label(mon)}</b> légendaire !`, "legend");
  }
}

const revealAll = () => revealBalls(state.pending.map((_, i) => i));

function renderShelf() {
  const shelf = $("#shelf");
  if (!state.pending.length) {
    shelf.innerHTML = `<div class="shelf-empty">
      <img src="${ballSprite(1)}" alt="" />
      <p>Ouvre un booster pour recevoir ${PACK_SIZE} Balls !</p></div>`;
  } else {
    shelf.innerHTML = state.pending.map((b, i) => {
      if (!b.opened) {
        return `<button class="ball-slot tier-${b.tier}" data-i="${i}" title="Ouvrir">
          <img class="ball" src="${ballSprite(b.tier)}" alt="" />
          <span class="ball-name">${TIERS[b.tier].name}</span></button>`;
      }
      const html = cardHtml({ type: "mon", ...b }, { isNew: b.isNew });
      return `<div class="slot-card ${justRevealed.has(i) ? "pop" : ""}" data-i="${i}">${html}</div>`;
    }).join("");
  }
  justRevealed.clear();
  renderControls();
}

function renderControls() {
  const left = unopened();
  $("#open-pack").disabled = state.packs <= 0 || left > 0;
  $("#open-pack").textContent = left > 0 ? `${left} Ball${left > 1 ? "s" : ""} à ouvrir` : "Ouvrir un booster";
  $("#open-all").hidden = left < 2;
}

export function renderCounters() {
  $("#pack-count").textContent = state.packs;
  $("#nav-packs").textContent = state.packs;
  $("#nav-packs").classList.toggle("hot", state.packs > 0);
  const ms = nextPackIn();
  if (ms === null) {
    $("#pack-timer-label").textContent = `Réserve pleine (${MAX_PACKS} max)`;
    $("#pack-timer-bar").style.width = "100%";
  } else {
    $("#pack-timer-label").textContent = `Prochain booster dans ${Math.ceil(ms / 1000)} s`;
    $("#pack-timer-bar").style.width = `${100 - (ms / PACK_INTERVAL) * 100}%`;
  }
  renderControls();
}

function renderOdds() {
  const total = TIERS.slice(1).reduce((s, t) => s + t.weight, 0);
  $("#odds-table").innerHTML = `<table class="odds-table">
    <tr><th>Ball</th><th>Chance</th><th>Pokémon</th></tr>
    ${TIERS.slice(1).map((t) => `<tr>
      <td>${tierBadge(t.id)}</td>
      <td>${((t.weight / total) * 100).toFixed(1)} %</td>
      <td>${byTier[t.id].length}</td></tr>`).join("")}
  </table>
  <p class="muted">Rareté calculée depuis PokéAPI : taux de capture + total des stats de base ;
  Master Ball = légendaires et fabuleux. Chance de shiny : 1/${Math.round(1 / SHINY_ODDS)}.</p>`;
}

export function initBooster() {
  $("#open-pack").addEventListener("click", openPack);
  $("#open-all").addEventListener("click", revealAll);
  $("#shelf").addEventListener("click", (e) => {
    const slot = e.target.closest(".ball-slot");
    if (slot) revealBalls([Number(slot.dataset.i)]);
  });
  document.addEventListener("keydown", (e) => {
    const onBoosterTab = !location.hash || location.hash === "#booster";
    if (e.code !== "Space" || !onBoosterTab) return;
    if (modalOpen() || ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
    e.preventDefault();
    if (unopened() > 0) revealAll();
    else openPack();
  });
  renderOdds();
  renderShelf();
  renderCounters();
}
