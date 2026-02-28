/* Work Force — Windows 11 (Mouse + Keyboard) build
   Features:
   - Add/Edit calls (modal)
   - Search
   - Filter chips
   - Status dropdown per card
   - LocalStorage persistence + migration from older versions
   - Desktop selection highlight
   - Right-click context menu (Call/Edit/Complete/Delete)
   - Keyboard shortcuts:
       N = New
       / = Focus search
       E = Edit selected
       C = Complete selected
       Delete/Backspace = Delete selected
       Esc = Close context menu
*/

const STORAGE_KEY = "workforce_calls_v3";

// ---------- Elements ----------
const el = {
  btnNew: document.getElementById("btnNew"),
  btnNewEmpty: document.getElementById("btnNewEmpty"),
  overlay: document.getElementById("modalOverlay"),
  btnClose: document.getElementById("btnClose"),
  btnCancel: document.getElementById("btnCancel"),
  form: document.getElementById("callForm"),
  cards: document.getElementById("cards"),
  empty: document.getElementById("emptyState"),
  chips: Array.from(document.querySelectorAll(".chip")),
  search: document.getElementById("searchInput"),

  // modal fields
  name: document.getElementById("name"),
  phone: document.getElementById("phone"),
  address: document.getElementById("address"),
  priority: document.getElementById("priority"),
  status: document.getElementById("status"),
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
};

// Desktop selection
let selectedId = null;

// Context menu target
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
  // New key
  const v3 = safeLoad(STORAGE_KEY);
  if (v3) return v3;

  // Migrate from v2
  const v2 = safeLoad("workforce_calls_v2");
  if (v2) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v2));
    return v2;
  }

  // Migrate from v1
  const v1 = safeLoad("workforce_calls_v1");
  if (v1) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v1));
    return v1;
  }

  return [];
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

function matchesQuery(call, q) {
  if (!q) return true;
  const hay = [call.name, call.phone, call.address, call.notes].join(" ").toLowerCase();
  return hay.includes(q);
}

function normalizePhoneForTel(phone) {
  const p = (phone || "").trim();
  return p ? p.replace(/\s+/g, "") : "";
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
    el.notes.value = call.notes || "";
  } else {
    el.modalTitle.textContent = "New Service Call";
    el.btnSave.textContent = "Save Call";
    el.editId.value = "";
    el.form.reset();
    el.priority.value = "medium";
    el.status.value = "new";
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

  // Keep menu on-screen
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

// ---------- Render ----------
function badgePriority(priority) {
  return `<span class="badge priority ${priority}">Priority: ${priorityLabel(priority)}</span>`;
}

function badgeStatus(status) {
  return `<span class="badge">Status: ${escapeHTML(formatStatus(status))}</span>`;
}

function cardHTML(call) {
  const phone = (call.phone || "").trim();
  const address = (call.address || "").trim();
  const notes = (call.notes || "").trim();

  const lines = [];
  if (phone) lines.push(`📞 ${escapeHTML(phone)}`);
  if (address) lines.push(`📍 ${escapeHTML(address)}`);
  if (notes) lines.push(`📝 ${escapeHTML(notes)}`);

  const tel = phone ? `tel:${encodeURIComponent(normalizePhoneForTel(phone))}` : "";

  return `
    <article class="card" data-id="${call.id}">
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

function render() {
  const q = (state.query || "").trim().toLowerCase();

  const calls = state.calls
    .slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .filter(c => (state.filter === "all" ? true : c.status === state.filter))
    .filter(c => matchesQuery(c, q));

  el.cards.innerHTML = calls.map(cardHTML).join("");

  const hasAny = state.calls.length > 0;
  el.empty.style.display = hasAny ? "none" : "block";

  wireUIAfterRender();
  // Keep selection highlight after re-render
  if (selectedId) selectCard(selectedId);
}

// ---------- Wiring ----------
function wireUIAfterRender() {
  // Call buttons
  el.cards.querySelectorAll(".btn-call").forEach(btn => {
    if (btn.disabled) return;
    btn.addEventListener("click", () => {
      const tel = btn.getAttribute("data-tel");
      if (tel) window.location.href = tel;
    });
  });

  // Status dropdown changes
  el.cards.querySelectorAll(".status-select").forEach(sel => {
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

  // Card select + right-click menu + edit/delete
  el.cards.querySelectorAll(".card").forEach(card => {
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
      // adjust selection
      if (selectedId === id) selectedId = null;
      render();
    });
  });
}

// Prevent double-binding context menu buttons by cloning once at startup
function prepareContextMenuBindings() {
  if (!ctx) return;

  // Close on click outside menu
  ctx.addEventListener("click", (e) => {
    if (e.target === ctx) closeCtx();
  });

  // Clone ctx-item buttons to wipe any previous listeners (safe)
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

el.form?.addEventListener("submit", (e) => {
  e.preventDefault();

  const payload = {
    name: el.name.value.trim(),
    phone: el.phone.value.trim(),
    address: el.address.value.trim(),
    priority: el.priority.value,
    status: el.status.value,
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

// Keyboard shortcuts (Windows workflow)
document.addEventListener("keydown", (e) => {
  // ignore typing in fields
  const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
  if (tag === "input" || tag === "textarea" || tag === "select") return;

  if (e.key.toLowerCase() === "n") {
    openModal("new");
  }

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

  if (e.key === "Escape") {
    closeCtx();
  }
});

// ---------- Startup ----------
prepareContextMenuBindings();
render();
