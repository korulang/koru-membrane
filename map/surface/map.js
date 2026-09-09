// Map surface — ontology rail + concept field, one lane per schema plus a
// dashed blank lane for concepts no schema covers (the visible gap).
// Click = deref: belief + full git trajectory in the inspector.

const canvas = document.getElementById("field");
const ctx = canvas.getContext("2d");
const lanesEl = document.getElementById("lanes");
const scrub = document.getElementById("scrub");
const cursorEl = document.getElementById("cursor");
const countsEl = document.getElementById("counts");
const detailEl = document.getElementById("detail");
const subEl = document.getElementById("sub");

let range = { min: null, max: null };
let lanes = [];   // schema ids + "blank"
let nodes = [];
let edges = [];
let active = null;
let hover = null;
let simHeat = 0;

const COLOR = { seeded: "#5d6b7d", evolved: "#59f2ff", scarred: "#ff5a3c", blank: "#b06bff" };

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function resize() {
  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;
}
addEventListener("resize", () => { resize(); layout(); draw(); });

async function load(at) {
  const q = at === null ? "" : `?at=${at}`;
  const snap = await (await fetch(`/api/map${q}`)).json();
  range = snap.range;
  lanes = [...snap.ontology.map((o) => o.id), "blank"];
  nodes = snap.nodes;
  edges = snap.edges ?? [];
  subEl.textContent = `ontology × concepts · ${snap.counts.concepts} concepts · ${snap.counts.events} lineage events`;
  cursorEl.textContent = snap.at ? new Date(snap.at).toLocaleString() : "head";
  countsEl.textContent = `${snap.counts.scarred} scarred · ${snap.counts.blank} blank`;
  lanesEl.innerHTML = "";
  for (const o of snap.ontology) {
    const d = document.createElement("div");
    d.className = "lane" + (active === o.id ? " active" : "");
    d.innerHTML = `<div class="lbl">${esc(o.id)}</div><div class="meta">${o.memberCount} members</div>`;
    d.onclick = () => { active = active === o.id ? null : o.id; simHeat = 1; requestAnimationFrame(tick); markActive(); };
    lanesEl.appendChild(d);
  }
  const blank = snap.nodes.filter((n) => n.lanes.length === 0).length;
  const b = document.createElement("div");
  b.className = "lane blank" + (active === "blank" ? " active" : "");
  b.innerHTML = `<div class="lbl">blank — no schema</div><div class="meta">${blank} concepts · the gap</div>`;
  b.onclick = () => { active = active === "blank" ? null : "blank"; simHeat = 1; requestAnimationFrame(tick); markActive(); };
  lanesEl.appendChild(b);
  layout();
  draw();
}

function markActive() {
  lanesEl.querySelectorAll(".lane").forEach((el, i) => {
    const id = i < lanes.length - 1 ? lanes[i] : "blank";
    el.classList.toggle("active", active === id);
  });
}

function laneOf(n) {
  if (n.lanes.length === 0) return lanes.indexOf("blank");
  const i = lanes.indexOf(n.lanes[0]);
  return i === -1 ? lanes.indexOf("blank") : i;
}

function layout() {
  // Deterministic seed: one horizontal lane per ontology entry.
  const per = new Map();
  for (const n of nodes) {
    const l = laneOf(n);
    n._lane = l;
    n._slot = (per.get(l) ?? 0) + 1;
    per.set(l, n._slot);
  }
  const W = canvas.width, H = canvas.height, L = Math.max(1, lanes.length);
  for (const n of nodes) {
    const total = per.get(n._lane) ?? 1;
    n._x = W * 0.06 + ((n._slot - 0.5) / total) * W * 0.88;
    n._y = (H * (n._lane + 1)) / (L + 1);
    n._r = (2 + Math.min(5, Math.sqrt(n.eventCount + 1))) * devicePixelRatio;
    n._vx = 0; n._vy = 0;
  }
  // Springs need something to pull on: index edges by node id.
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) n._links = [];
  for (const e of edges) {
    const a = byId.get(e.from), b = byId.get(e.to);
    if (a && b) { a._links.push(b); b._links.push(a); }
  }
  simHeat = 1;
  requestAnimationFrame(tick);
}

function laneY(lane) {
  const L = Math.max(1, lanes.length);
  return (canvas.height * (lane + 1)) / (L + 1);
}

function tick() {
  // Force layout: lane gravity (y) + weak x anchor + pairwise repulsion +
  // wikilink/lineage springs. Cools to rest; reheats on load/filter.
  if (simHeat < 0.01) { simHeat = 0; draw(); return; }
  const W = canvas.width, dpr = devicePixelRatio;
  const linkLen = 90 * dpr, repulse = 2600 * dpr * dpr;
  for (const n of nodes) {
    if (!visible(n)) continue;
    let fx = (W / 2 - n._x) * 0.008;                    // weak x anchor
    let fy = (laneY(n._lane) - n._y) * 0.06;            // lane gravity
    for (const m of nodes) {
      if (m === n || !visible(m)) continue;
      const dx = n._x - m._x, dy = n._y - m._y;
      const d2 = dx * dx + dy * dy + 400;
      const f = repulse / d2;
      const d = Math.sqrt(d2);
      fx += (dx / d) * f; fy += (dy / d) * f;
    }
    for (const m of n._links ?? []) {
      if (!visible(m)) continue;
      const dx = m._x - n._x, dy = m._y - n._y;
      const d = Math.hypot(dx, dy) || 1;
      const f = (d - linkLen) * 0.02;
      fx += (dx / d) * f; fy += (dy / d) * f;
    }
    n._vx = (n._vx + fx) * 0.82;
    n._vy = (n._vy + fy) * 0.82;
    n._x += n._vx * simHeat;
    n._y += n._vy * simHeat;
  }
  simHeat *= 0.96;
  draw();
  requestAnimationFrame(tick);
}

function visible(n) {
  if (!active) return true;
  if (active === "blank") return n.lanes.length === 0;
  return n.lanes.includes(active);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const dpr = devicePixelRatio;
  // Springs first, faint — the pull made visible.
  ctx.strokeStyle = "rgba(160,190,220,0.13)";
  ctx.lineWidth = 1 * dpr;
  const drawn = new Set();
  for (const e of edges) {
    const k = e.from < e.to ? e.from + ">" + e.to : e.to + ">" + e.from;
    if (drawn.has(k)) continue;
    drawn.add(k);
    const a = nodes.find((n) => n.id === e.from), b = nodes.find((n) => n.id === e.to);
    if (!a || !b || !visible(a) || !visible(b)) continue;
    ctx.beginPath();
    ctx.moveTo(a._x, a._y);
    ctx.lineTo(b._x, b._y);
    ctx.stroke();
  }
  for (const n of nodes) {
    if (!visible(n)) continue;
    const dim = hover && hover !== n;
    ctx.globalAlpha = dim ? 0.22 : 1;
    const color = COLOR[n.status] ?? "#d7e3ef";
    ctx.beginPath();
    ctx.arc(n._x, n._y, n._r, 0, Math.PI * 2);
    if (n.status === "seeded") {
      ctx.strokeStyle = color; ctx.lineWidth = 1.2 * dpr; ctx.stroke();
    } else {
      ctx.fillStyle = color; ctx.fill();
    }
    if (n.status === "scarred") {
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      ctx.moveTo(n._x - n._r - 2, n._y - n._r - 2);
      ctx.lineTo(n._x + n._r + 2, n._y + n._r + 2);
      ctx.stroke();
    }
    if (hover === n) {
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath(); ctx.arc(n._x, n._y, n._r + 4 * dpr, 0, Math.PI * 2); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function pick(ev) {
  const r = canvas.getBoundingClientRect();
  const x = (ev.clientX - r.left) * devicePixelRatio, y = (ev.clientY - r.top) * devicePixelRatio;
  let best = null, bd = 14 * devicePixelRatio;
  for (const n of nodes) {
    if (!visible(n)) continue;
    const d = Math.hypot(n._x - x, n._y - y);
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

canvas.addEventListener("mousemove", (ev) => {
  const n = pick(ev);
  if (n !== hover) { hover = n; canvas.style.cursor = n ? "pointer" : "crosshair"; draw(); }
});

canvas.addEventListener("click", async (ev) => {
  const n = pick(ev);
  if (!n) return;
  const t = await (await fetch(`/api/trajectory?id=${encodeURIComponent(n.id)}`)).json();
  detailEl.innerHTML = `
    <div style="color:var(--dim)">${esc(t.id)} · ${esc(n.status)} · ${n.eventCount} events</div>
    <div class="belief">${esc(t.belief)}</div>
    <div style="color:var(--dim)">tags: ${t.tags.map(esc).join(", ") || "—"}</div>
    <div class="hist">${t.history.map((h) => `
      <div class="ev"><div class="t">${new Date(h.ts).toLocaleString()} · ${esc(h.action)} · ${esc(h.sha)}</div>
      <div>${esc(h.summary)}</div>
      ${h.action === "correct" ? `<div class="scar" style="color:var(--ember)">✕ ${esc(h.reason ?? "")}</div>` : ""}</div>`).join("") || "<p>no lineage events</p>"}</div>`;
});

function currentAt() {
  if (!range.min || !range.max || range.min === range.max) return null;
  const t = Number(scrub.value) / 1000;
  return t >= 1 ? null : Math.round(range.min + t * (range.max - range.min));
}

let timer = null;
scrub.addEventListener("input", () => {
  clearTimeout(timer);
  timer = setTimeout(() => load(currentAt()), 120);
});

resize();
load(null);
