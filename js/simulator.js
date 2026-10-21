import {
  pokedex, byId, label, matches, officialSprite, fusionOptions, fusionSpriteUrl, fusionName,
  fusionTypes, fusionStats, fusionTier, typeBadges, statsTable,
} from "./data.js";
import { $, tierBadge } from "./ui.js";

const selection = { head: null, body: null };

function setupPicker(root) {
  const role = root.dataset.role;
  const input = $("input", root);
  const list = $(".results", root);
  let items = [];
  let active = -1;

  const render = () => {
    items = pokedex.filter((p) => matches(p, input.value)).slice(0, 30);
    active = -1;
    list.innerHTML = items.map((p) => `<li data-id="${p.id}">
      <img src="${officialSprite(p)}" loading="lazy" alt="" />${label(p)}<span class="num">#${p.nat}</span></li>`).join("");
    list.classList.toggle("open", items.length > 0);
  };
  const choose = (p) => { list.classList.remove("open"); select(role, p); };

  input.addEventListener("focus", () => { input.select(); render(); });
  input.addEventListener("input", render);
  input.addEventListener("blur", () => setTimeout(() => list.classList.remove("open"), 150));
  input.addEventListener("keydown", (e) => {
    if (!list.classList.contains("open") || !items.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      [...list.children].forEach((li, i) => li.classList.toggle("active", i === active));
      list.children[active].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      choose(items[Math.max(active, 0)]);
    }
  });
  list.addEventListener("mousedown", (e) => {
    const li = e.target.closest("li");
    if (li) choose(byId.get(Number(li.dataset.id)));
  });
}

function select(role, p) {
  selection[role] = p;
  const root = $(`.sim-picker[data-role="${role}"]`);
  $("input", root).value = label(p);
  $(".sim-preview", root).innerHTML = `<img src="${officialSprite(p)}" alt="" />${tierBadge(p.tier)}`;
  render();
}

async function render() {
  const { head, body } = selection;
  if (!head || !body) return;
  const opts = await fusionOptions(head.id, body.id);
  const sprites = opts.custom.map((c) => ({
    url: fusionSpriteUrl(head.id, body.id, c.variant),
    text: `${c.variant ? `Alternatif ${c.variant.toUpperCase()}` : "Principal"} · ${c.artist || "artiste inconnu"}`,
  }));
  if (opts.auto) sprites.push({ url: fusionSpriteUrl(head.id, body.id, null), text: "Auto-généré" });

  $("#sim-result").innerHTML = `<div class="sim-card">
    <h3>${fusionName(head, body)}</h3>
    ${tierBadge(fusionTier(head.tier, body.tier))}
    <div class="sim-art">${sprites.length
      ? `<img id="sim-sprite" src="${sprites[0].url}" alt="" />`
      : `<div class="sim-none"><img src="${officialSprite(head)}" alt="" /><span>+</span><img src="${officialSprite(body)}" alt="" /></div>`}
    </div>
    <p class="muted" id="sim-credit">${sprites[0]?.text || "Pas encore de sprite dessiné pour cette fusion"}</p>
    ${sprites.length > 1 ? `<div class="variants">${sprites.map((s, i) =>
      `<img src="${s.url}" data-i="${i}" class="${i ? "" : "on"}" title="${s.text}" loading="lazy" />`).join("")}</div>` : ""}
    ${typeBadges(fusionTypes(head, body))}
    ${statsTable(fusionStats(head, body))}
  </div>`;

  $("#sim-result .variants")?.addEventListener("click", (e) => {
    const el = e.target.closest("img");
    if (!el) return;
    const s = sprites[el.dataset.i];
    $("#sim-sprite").src = s.url;
    $("#sim-credit").textContent = s.text;
    $("#sim-result .variants").querySelectorAll("img").forEach((x) => x.classList.toggle("on", x === el));
  });
}

export function initSimulator() {
  document.querySelectorAll(".sim-picker").forEach(setupPicker);
  $("#sim-swap").addEventListener("click", () => {
    const { head, body } = selection;
    if (body) select("head", body);
    if (head) select("body", head);
  });
  $("#sim-random").addEventListener("click", () => {
    const pick = () => pokedex[Math.floor(Math.random() * pokedex.length)];
    select("head", pick());
    select("body", pick());
  });
}
