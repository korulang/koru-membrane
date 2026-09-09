// Map surface — two columns, no canvas: ontology cards left, concept cards
// right (newest first). Click an ontology to filter; click a concept for its
// full trajectory below. The scrubber re-folds at a timestamp.

let range = { min: null, max: null };
let nodes = [];
let active = null;

const ontsEl = document.getElementById("onts");
const concolEl = document.getElementById("concol");
const scrub = document.getElementById("scrub");
const cursorEl = document.getElementById("cursor");
const countsEl = document.getElementById("counts");
const detailEl = document.getElementById("detail");
const subEl = document.getElementById("sub");

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function fmtT(ts) {
  return ts ? new Date(ts).toLocaleString() : "—";
}

async function load(at) {
  const q = at === null ? "" : `?at=${at}`;
  const snap = await (await fetch(`/api/map${q}`)).json();
  range = snap.range;
  nodes = [...snap.nodes].sort((a, b) => (b.lastEventAt ?? 0) - (a.lastEventAt ?? 0));
  subEl.textContent = `ontologies × concepts · ${snap.counts.concepts} concepts · ${snap.counts.events} lineage events`;
  cursorEl.textContent = snap.at ? new Date(snap.at).toLocaleString() : "head";
  countsEl.textContent = `${snap.counts.scarred} scarred · ${snap.counts.blank} blank`;

  ontsEl.innerHTML = "";
  for (const o of snap.ontology) {
    const d = document.createElement("div");
    d.className = "card" + (active === o.id ? " active" : "");
    d.innerHTML = `<div class="id">${esc(o.id)}</div>
      <div class="meta">${o.memberCount} members</div>`;
    d.onclick = () => { active = active === o.id ? null : o.id; render(); };
    ontsEl.appendChild(d);
  }
  const blankN = snap.nodes.filter((n) => n.lanes.length === 0).length;
  const b = document.createElement("div");
  b.className = "card blanklane" + (active === "blank" ? " active" : "");
  b.innerHTML = `<div class="id">blank — no schema</div><div class="meta">${blankN} concepts · the gap</div>`;
  b.onclick = () => { active = active === "blank" ? null : "blank"; render(); };
  ontsEl.appendChild(b);

  render();
}

function visible(n) {
  if (!active) return true;
  if (active === "blank") return n.lanes.length === 0;
  return n.lanes.includes(active);
}

function render() {
  ontsEl.querySelectorAll(".card").forEach((el) => {
    const id = el.querySelector(".id")?.textContent ?? "";
    const key = id.startsWith("blank") ? "blank" : id;
    el.classList.toggle("active", active === key);
  });
  concolEl.innerHTML = "";
  for (const n of nodes) {
    if (!visible(n)) continue;
    const d = document.createElement("div");
    d.className = "card";
    d.innerHTML = `<span class="badge b-${n.status}">${n.status}</span>
      <div class="belief">${esc(n.belief)}</div>
      <div class="meta">${esc(n.id)} · ${n.eventCount} events · ${fmtT(n.lastEventAt)}${n.lanes.length ? " · " + n.lanes.map(esc).join(", ") : ""}</div>`;
    d.onclick = () => inspect(n.id);
    concolEl.appendChild(d);
  }
}

async function inspect(id) {
  const t = await (await fetch(`/api/trajectory?id=${encodeURIComponent(id)}`)).json();
  detailEl.innerHTML = `
    <div style="color:var(--dim)">${esc(t.id)} · tags: ${t.tags.map(esc).join(", ") || "—"}</div>
    <div style="margin:8px 0;line-height:1.5">${esc(t.belief)}</div>
    ${t.history.map((h) => `
      <div class="ev"><div class="t">${new Date(h.ts).toLocaleString()} · ${esc(h.action)} · ${esc(h.sha)}</div>
      <div>${esc(h.summary)}</div>
      ${h.action === "correct" ? `<div class="scar">✕ ${esc(h.reason ?? "")}</div>` : ""}</div>`).join("") || "<p>no lineage events</p>"}`;
  detailEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

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

load(null);
