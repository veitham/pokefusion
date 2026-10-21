const KEY = "pokefusion-save-v1";

export const PACK_INTERVAL = 15_000;
export const PACK_SIZE = 5;
export const MAX_PACKS = 10;
export const RELEASES_PER_PACK = 4;

const defaults = () => ({
  packs: 3,
  lastPackAt: Date.now(),
  pending: [],
  items: [],
  seen: {},
  nextUid: 1,
  releaseCredit: 0,
  stats: { opened: 0, balls: 0, fusions: 0, released: 0 },
  settings: { sound: true },
});

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved) return { ...defaults(), ...saved, stats: { ...defaults().stats, ...saved.stats } };
  } catch { /* corrupted save: start over */ }
  return defaults();
}

export const state = load();
const listeners = new Set();

export const subscribe = (fn) => listeners.add(fn);

export function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
  listeners.forEach((fn) => fn());
}

export function reset() {
  localStorage.removeItem(KEY);
  location.reload();
}

// Packs keep accruing while the page is closed, up to MAX_PACKS.
export function tickPacks(now = Date.now()) {
  if (state.packs >= MAX_PACKS) {
    state.lastPackAt = now;
    return;
  }
  const earned = Math.floor((now - state.lastPackAt) / PACK_INTERVAL);
  if (earned <= 0) return;
  state.packs = Math.min(MAX_PACKS, state.packs + earned);
  state.lastPackAt = state.packs >= MAX_PACKS ? now : state.lastPackAt + earned * PACK_INTERVAL;
  save();
}

export const nextPackIn = (now = Date.now()) =>
  state.packs >= MAX_PACKS ? null : Math.max(0, PACK_INTERVAL - (now - state.lastPackAt));

export function addItem(item) {
  const full = { ...item, uid: state.nextUid++, at: Date.now() };
  state.items.push(full);
  return full;
}

export function removeItems(uids) {
  const set = new Set(uids);
  state.items = state.items.filter((it) => !set.has(it.uid));
}

const groupKey = (it) => it.type === "fusion"
  ? `f:${it.head}:${it.body}:${it.variant}:${it.shiny ? 1 : 0}`
  : `m:${it.id}:${it.shiny ? 1 : 0}`;

// Identical items (same Pokémon / same fusion sprite, same shininess) stacked together.
export function groupItems(items) {
  const map = new Map();
  for (const it of items) {
    const key = groupKey(it);
    let g = map.get(key);
    if (!g) map.set(key, (g = { key, item: it, uids: [], latest: 0 }));
    g.uids.push(it.uid);
    g.latest = Math.max(g.latest, it.at);
  }
  return [...map.values()];
}

// Grants a bonus pack every RELEASES_PER_PACK released Pokémon (can exceed MAX_PACKS).
export function creditReleases(count) {
  state.stats.released += count;
  state.releaseCredit += count;
  const packs = Math.floor(state.releaseCredit / RELEASES_PER_PACK);
  state.releaseCredit %= RELEASES_PER_PACK;
  state.packs += packs;
  return packs;
}
