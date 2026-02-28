/* Work Force — Windows 11 Dispatch Build (List + Board + Drag/Drop)
   - Add/Edit calls (modal)
   - Search + filter chips
   - Status dropdown per card
   - Scheduled date/time (datetime-local)
   - View toggle: List / Board
   - Drag & drop dispatch board (Unscheduled/Today/Tomorrow/This Week/Completed)
   - Desktop selection + right-click context menu
   - Hotkeys: N, /, E, C, Delete, Esc
*/

const STORAGE_KEY = "workforce_calls_v4";

// ---------- Elements ----------
const el = {
  btnNew: document.getElementById("btnNew"),
  btnNewEmpty: document.getElementById("btnNewEmpty"),
  overlay: document.getElementById("modalOverlay"),
  btnClose: document.getElementById("btnClose"),
  btnCancel: document.getElementById("btnCancel"),
  form: document.getElementById("callForm"),
  cards: document.getElementById("cards"),
  board: document.getElementById("board"),
  empty: document.getElementById("emptyState"),
  chips: Array.from(document.querySelectorAll(".chip")),
  search: document.getElementById("searchInput"),

  // view
  viewList: document.getElementById("viewList"),
  viewBoard: document.getElementById("viewBoard"),

  // modal fields
  name: document.getElementById("name"),
  phone: document.getElementById("phone"),
  address: document.getElementById("address"),
  priority: document.getElementById("priority"),
  status: document.getElementById("status"),
  scheduledAt: document.getElementById("scheduledAt"),
  notes: document.getElementById("notes"),
  editId: document.getElementById("editId"),
  modalTitle: document.getElementById("modalTitle"),
  btnSave: document.getElementById("btnSave"),
};

// Context menu elements (must exist in index.html)
const ctx = document.getElementById("ctx");
const ctxMenu = document.getElementById("ctxMenu");

// ---------- State ----------
let state = {
  calls: migrateOrLoad(),
  filter: "all",
  query: "",
  view: "list", // "list" | "board"
};

let selectedId = null;
let ctxTargetId = null;

// ---------- Utilities ----------
function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function safeLoad(key) {
  try {
    const raw = localStorage.getItem(key);
    const data = raw ? JSON.parse(raw) : null;
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

function migrateOrLoad() {
  const current = safeLoad(STORAGE_KEY);
  if (current) return current;

  // migrate older keys if present
  const v3 = safeLoad("workforce_calls_v3");
  const v2 = safeLoad("workforce_calls_v2");
  const v1 = safeLoad("workforce_calls_v1");
  const found = v3 || v2 || v1 || [];

  localStorage.setItem(STORAGE_KEY, JSON.stringify(found));
  return found;
}

function saveCalls() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.calls));
}

function escapeHTML(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatStatus(s) {
  switch (s) {
    case "new": return "New";
    case "scheduled": return "Scheduled";
    case "in_progress": return "In Progress";
    case "done": return "Completed";
    default: return s;
  }
}

function priorityLabel(p) {
  return p === "high" ? "High" : p === "low" ? "Low" : "Medium";
}

function normalizePhoneForTel(phone) {
  const p = (phone || "").trim();
  return p ? p.replace(/\s+/g, "") : "";
}

function matchesQuery(call, q) {
  if (!q) return true;
  const hay = [call.name, call.phone, call.address, call.notes].join(" ").toLowerCase();
  return hay.includes(q);
}

function toLocalInputValue(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function fromLocalInputValue(val) {
  if (!val) return null;
  const d = new Date(val);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0,0,0,0);
  return d.getTime();
}

function dayMs(n) {
  return startOfToday() + n * 24 * 60 * 60 * 1000;
}

function withinThisWeek(ms) {
  if (!ms) return false;
  const now = new Date();
  const start = new Date(now);
  start.setHours(0,0,0,0);
  // define "this week" as now..next 7 days
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return ms >= start.getTime() && ms < end.getTime();
}

function bucketFor(call) {
  if ((call.status || "new") === "done") return "done";
  const s = call.scheduledAt || null;
  if (!s) return "unscheduled";

  const t0 = dayMs(0);
  const t1 = dayMs(1);
  const t2 = dayMs(2);

  if (s >= t0 && s < t1) return "today";
  if (s >= t1 && s < t2) return "tomorrow";
  if (withinThisWeek(s)) return "week";
  return "week";
}

function setScheduleForBucket(call, bucket) {
  if (bucket === "unscheduled") {
    call.scheduledAt = null;
    // keep status as-is unless done
    if (call.status === "scheduled") call.status = "new";
    return;
  }

  if (bucket === "done") {
    call.status = "done";
    return;
  }

  // Drop into schedule buckets: set a default time 9:00 AM
  const d = new Date(startOfToday());
  if (bucket === "today") d.setDate(d.getDate());
  if (bucket === "tomorrow") d.setDate(d.getDate() + 1);
  if (bucket === "week") d.setDate(d.getDate() + 2);
  d.setHours(9, 0, 0, 0);

  call.scheduledAt = d.getTime();
  if (call.status !== "done") call.status = "scheduled";
}

// ---------- Modal ----------
function openModal(mode = "new", call = null) {
  el.overlay.classList.remove("hidden");
  el.overlay.setAttribute("aria-hidden", "false");

  if (mode === "edit" && call) {
    el.modalTitle.textContent = "Edit Service Call";
    el.btnSave.textContent = "Save Changes";
    el.editId.value = call.id;

    el.name.value = call.name || "";
    el.phone.value = call.phone || "";
    el.address.value = call.address || "";
    el.priority.value = call.priority || "medium";
    el.status.value = call.status || "new";
    el.scheduledAt.value = toLocalInputValue(call.scheduledAt || null);
    el.notes.value = call.notes || "";
  } else {
    el.modalTitle.textContent = "New Service Call";
    el.btnSave.textContent = "Save Call";
    el.editId.value = "";
    el.form.reset();
    el.priority.value = "medium";
    el.status.value = "new";
    el.scheduledAt.value = "";
  }

  setTimeout(() => el.name?.focus(), 0);
}

function closeModal() {
  el.overlay.classList.add("hidden");
  el.overlay.setAttribute("aria-hidden", "true");
  el.form.reset();
  el.editId.value = "";
}

// ---------- Context Menu ----------
function closeCtx() {
  if (!ctx) return;
  ctx.classList.add("hidden");
  ctx.setAttribute("aria-hidden", "true");
  ctxTargetId = null;
}

function openCtx(x, y, id) {
  if (!ctx || !ctxMenu) return;
  ctxTargetId = id;

  ctx.classList.remove("hidden");
  ctx.setAttribute("aria-hidden", "false");

  const pad = 10;
  const w = 220;
  const h = 220;
  const maxX = window.innerWidth - w - pad;
  const maxY = window.innerHeight - h - pad;

  ctxMenu.style.left = `${Math.max(pad, Math.min(x, maxX))}px`;
  ctxMenu.style.top  = `${Math.max(pad, Math.min(y, maxY))}px`;
}

function selectCard(id) {
  selectedId = id;
  document.querySelectorAll(".card").forEach(c => c.classList.remove("selected"));
  const card = document.querySelector(`.card[data-id="${id}"]`);
  if (card) card.classList.add("selected");
}

// ---------- Render helpers ----------
function badgePriority(priority) {
  return `<span class="badge priority ${priority}">Priority: ${priorityLabel(priority)}</span>`;
}

function badgeStatus(status) {
  return `<span class="badge">Status: ${escapeHTML(formatStatus(status))}</span>`;
}

function fmtSchedule(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  return d.toLocaleString([], { weekday:"short", month:"short", day:"numeric", hour:"numeric", minute:"2-digit" });
}

function cardHTML(call, opts = { draggable: false }) {
  const phone = (call.phone || "").trim();
  const address = (call.address || "").trim();
  const notes = (call.notes || "").trim();
  const schedule = call.scheduledAt ? `🗓️ ${escapeHTML(fmtSchedule(call.scheduledAt))}` : "";

  const lines = [];
  if (phone) lines.push(`📞 ${escapeHTML(phone)}`);
  if (address) lines.push(`📍 ${escapeHTML(address)}`);
  if (schedule) lines.push(schedule);
  if (notes) lines.push(`📝 ${escapeHTML(notes)}`);

  const tel = phone ? `tel:${encodeURIComponent(normalizePhoneForTel(phone))}` : "";

  return `
    <article class="card" data-id="${call.id}" ${opts.draggable ? 'draggable="true"' : ""}>
      <div class="row">
        <div>
          <h3 class="title">${escapeHTML(call.name || "Unnamed")}</h3>
          <p class="sub">${lines.length ? lines.join("<br>") : `<span style="color:var(--muted)">No details yet</span>`}</p>
        </div>
        <div class="badges">
          ${badgePriority(call.priority || "medium")}
          ${badgeStatus(call.status || "new")}
        </div>
      </div>

      <div class="actions">
        <button class="btn primary btn-call" type="button" ${phone ? "" : "disabled"} data-tel="${tel}">
          Call
        </button>

        <select class="small-select status-select" data-id="${call.id}" aria-label="Change status">
          <option value="new" ${call.status==="new"?"selected":""}>New</option>
          <option value="scheduled" ${call.status==="scheduled"?"selected":""}>Scheduled</option>
          <option value="in_progress" ${call.status==="in_progress"?"selected":""}>In Progress</option>
          <option value="done" ${call.status==="done"?"selected":""}>Completed</option>
        </select>

        <button class="btn ghost btn-edit" type="button">Edit</button>
        <button class="btn ghost btn-delete" type="button">Delete</button>
      </div>
    </article>
  `;
}

function getFilteredCalls() {
  const q = (state.query || "").trim().toLowerCase();

  return state.calls
    .slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .filter(c => (state.filter === "all" ? true : (c.status || "new") === state.filter))
    .filter(c => matchesQuery(c, q));
}

function renderList() {
  const calls = getFilteredCalls();
  el.cards.innerHTML = calls.map(c => cardHTML(c, { draggable: false })).join("");
  wireUIAfterRender("list");

  el.cards.classList.remove("hidden");
  el.board.classList.add("hidden");
}

function boardColumn(title, id, itemsHtml) {
  return `
    <div class="board-col" data-bucket="${id}">
      <h3>${title} <span style="opacity:.7">${countInBucket(id)}</span></h3>
      <div class="dropzone" data-bucket="${id}">
        ${itemsHtml || ""}
      </div>
    </div>
  `;
}

function countInBucket(bucket) {
  const calls = getFilteredCalls();
  return calls.filter(c => bucketFor(c) === bucket).length;
}

function renderBoard() {
  const calls = getFilteredCalls();

  const buckets = {
    unscheduled: [],
    today: [],
    tomorrow: [],
    week: [],
    done: [],
  };

  for (const c of calls) {
    buckets[bucketFor(c)].push(c);
  }

  // priority sort within columns (high first), then scheduled time, then createdAt
  const p = { high: 3, medium: 2, low: 1 };
  for (const key of Object.keys(buckets)) {
    buckets[key].sort((a, b) => {
      const pa = p[a.priority || "medium"];
      const pb = p[b.priority || "medium"];
      if (pb !== pa) return pb - pa;

      const sa = a.scheduledAt || 0;
      const sb = b.scheduledAt || 0;
      if (sb !== sa) return sa - sb; // earlier first
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }

  const html =
    boardColumn("Unscheduled", "unscheduled", buckets.unscheduled.map(c => cardHTML(c, { draggable: true })).join("")) +
    boardColumn("Today", "today", buckets.today.map(c => cardHTML(c, { draggable: true })).join("")) +
    boardColumn("Tomorrow", "tomorrow", buckets.tomorrow.map(c => cardHTML(c, { draggable: true })).join("")) +
    boardColumn("This Week", "week", buckets.week.map(c => cardHTML(c, { draggable: true })).join("")) +
    boardColumn("Completed", "done", buckets.done.map(c => cardHTML(c, { draggable: true })).join(""));

  el.board.innerHTML = html;
  wireUIAfterRender("board");
  wireBoardDnD();

  el.board.classList.remove("hidden");
  el.cards.classList.add("hidden");
}

function render() {
  const hasAny = state.calls.length > 0;
  el.empty.style.display = hasAny ? "none" : "block";

  if (state.view === "board") renderBoard();
  else renderList();

  if (selectedId) selectCard(selectedId);
}

// ---------- Wiring ----------
function wireUIAfterRender(mode) {
  const root = mode === "board" ? el.board : el.cards;

  // Call buttons
  root.querySelectorAll(".btn-call").forEach(btn => {
    if (btn.disabled) return;
    btn.addEventListener("click", () => {
      const tel = btn.getAttribute("data-tel");
      if (tel) window.location.href = tel;
    });
  });

  // Status dropdown changes
  root.querySelectorAll(".status-select").forEach(sel => {
    sel.addEventListener("change", () => {
      const id = sel.getAttribute("data-id");
      const idx = state.calls.findIndex(c => c.id === id);
      if (idx === -1) return;
      state.calls[idx].status = sel.value;
      saveCalls();
      render();
      selectCard(id);
    });
  });

  // Card selection + right-click menu + edit/delete
  root.querySelectorAll(".card").forEach(card => {
    const id = card.getAttribute("data-id");

    // Click selects (but not when interacting with controls)
    card.addEventListener("click", (e) => {
      if (e.target.closest("button") || e.target.closest("select")) return;
      selectCard(id);
    });

    // Right-click opens context menu
    card.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      selectCard(id);
      openCtx(e.clientX, e.clientY, id);
    });

    // Edit button
    card.querySelector(".btn-edit")?.addEventListener("click", () => {
      const call = state.calls.find(c => c.id === id);
      if (!call) return;
      selectCard(id);
      openModal("edit", call);
    });

    // Delete button
    card.querySelector(".btn-delete")?.addEventListener("click", () => {
      const call = state.calls.find(c => c.id === id);
      if (!call) return;
      const ok = confirm(`Delete service call for "${call.name}"?`);
      if (!ok) return;

      state.calls = state.calls.filter(c => c.id !== id);
      saveCalls();
      if (selectedId === id) selectedId = null;
      render();
    });

    // Drag start (board mode only)
    if (mode === "board") {
      card.addEventListener("dragstart", (e) => {
        e.dataTransfer?.setData("text/plain", id);
        e.dataTransfer.effectAllowed = "move";
      });
    }
  });
}

function wireBoardDnD() {
  // highlight columns on drag-over
  el.board.querySelectorAll(".board-col").forEach(col => {
    col.addEventListener("dragover", (e) => {
      e.preventDefault();
      col.classList.add("drag-over");
    });
    col.addEventListener("dragleave", () => {
      col.classList.remove("drag-over");
    });
    col.addEventListener("drop", (e) => {
      e.preventDefault();
      col.classList.remove("drag-over");

      const id = e.dataTransfer?.getData("text/plain");
      if (!id) return;

      const bucket = col.getAttribute("data-bucket");
      const call = state.calls.find(c => c.id === id);
      if (!call) return;

      setScheduleForBucket(call, bucket);
      saveCalls();
      selectedId = id;
      render();
    });
  });
}

function prepareContextMenuBindings() {
  if (!ctx) return;

  // close on click outside menu
  ctx.addEventListener("click", (e) => {
    if (e.target === ctx) closeCtx();
  });

  // wipe old listeners safely
  document.querySelectorAll(".ctx-item").forEach(btn => {
    btn.replaceWith(btn.cloneNode(true));
  });

  document.querySelectorAll(".ctx-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const action = btn.getAttribute("data-action");
      const id = ctxTargetId;
      if (!id) return closeCtx();

      const call = state.calls.find(c => c.id === id);
      if (!call) return closeCtx();

      if (action === "call") {
        if (call.phone) window.location.href = "tel:" + normalizePhoneForTel(call.phone);
      }
      if (action === "edit") {
        openModal("edit", call);
      }
      if (action === "complete") {
        call.status = "done";
        saveCalls();
        render();
        selectCard(id);
      }
      if (action === "delete") {
        const ok = confirm(`Delete service call for "${call.name}"?`);
        if (ok) {
          state.calls = state.calls.filter(c => c.id !== id);
          saveCalls();
          if (selectedId === id) selectedId = null;
          render();
        }
      }

      closeCtx();
    });
  });
}

// ---------- Global events ----------
el.btnNew?.addEventListener("click", () => openModal("new"));
el.btnNewEmpty?.addEventListener("click", () => openModal("new"));

el.btnClose?.addEventListener("click", closeModal);
el.btnCancel?.addEventListener("click", closeModal);

el.overlay?.addEventListener("click", (e) => {
  if (e.target === el.overlay) closeModal();
});

// Save modal
el.form?.addEventListener("submit", (e) => {
  e.preventDefault();

  const payload = {
    name: el.name.value.trim(),
    phone: el.phone.value.trim(),
    address: el.address.value.trim(),
    priority: el.priority.value,
    status: el.status.value,
    scheduledAt: fromLocalInputValue(el.scheduledAt.value),
    notes: el.notes.value.trim(),
  };

  const editId = (el.editId.value || "").trim();

  if (editId) {
    const idx = state.calls.findIndex(c => c.id === editId);
    if (idx !== -1) {
      state.calls[idx] = { ...state.calls[idx], ...payload };
      saveCalls();
      closeModal();
      selectedId = editId;
      render();
      return;
    }
  }

  const newCall = {
    id: uid(),
    createdAt: Date.now(),
    ...payload,
  };

  state.calls.unshift(newCall);
  saveCalls();
  closeModal();
  selectedId = newCall.id;
  render();
});

// Filter chips
el.chips?.forEach(chip => {
  chip.addEventListener("click", () => {
    el.chips.forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    state.filter = chip.getAttribute("data-filter") || "all";
    render();
  });
});

// Search
el.search?.addEventListener("input", () => {
  state.query = el.search.value || "";
  render();
});

// View toggle
el.viewList?.addEventListener("click", () => {
  state.view = "list";
  el.viewList.classList.add("active");
  el.viewBoard.classList.remove("active");
  render();
});
el.viewBoard?.addEventListener("click", () => {
  state.view = "board";
  el.viewBoard.classList.add("active");
  el.viewList.classList.remove("active");
  render();
});

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
  if (tag === "input" || tag === "textarea" || tag === "select") return;

  if (e.key.toLowerCase() === "n") openModal("new");

  if (e.key === "/") {
    e.preventDefault();
    el.search?.focus();
  }

  if (e.key.toLowerCase() === "e" && selectedId) {
    const call = state.calls.find(c => c.id === selectedId);
    if (call) openModal("edit", call);
  }

  if (e.key.toLowerCase() === "c" && selectedId) {
    const call = state.calls.find(c => c.id === selectedId);
    if (!call) return;
    call.status = "done";
    saveCalls();
    render();
    selectCard(selectedId);
  }

  if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
    const call = state.calls.find(c => c.id === selectedId);
    if (!call) return;
    const ok = confirm(`Delete service call for "${call.name}"?`);
    if (!ok) return;
    state.calls = state.calls.filter(c => c.id !== selectedId);
    saveCalls();
    selectedId = null;
    render();
  }

  if (e.key === "Escape") closeCtx();
});

// ---------- Startup ----------
prepareContextMenuBindings();
render();
