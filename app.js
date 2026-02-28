const STORAGE_KEY = "workforce_calls_v2";

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

let state = {
  calls: migrateOrLoad(),
  filter: "all",
  query: "",
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function migrateOrLoad() {
  // migrate from v1 if present
  const v2 = safeLoad(STORAGE_KEY);
  if (v2) return v2;

  const v1 = safeLoad("workforce_calls_v1");
  if (v1) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v1));
    return v1;
  }
  return [];
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

function saveCalls() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.calls));
}

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

  setTimeout(() => el.name.focus(), 0);
}

function closeModal() {
  el.overlay.classList.add("hidden");
  el.overlay.setAttribute("aria-hidden", "true");
  el.form.reset();
  el.editId.value = "";
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

function badgePriority(priority) {
  const label = priority === "high" ? "High" : priority === "low" ? "Low" : "Medium";
  return `<span class="badge priority ${priority}">Priority: ${label}</span>`;
}

function badgeStatus(status) {
  return `<span class="badge">Status: ${formatStatus(status)}</span>`;
}

function matchesQuery(call, q) {
  if (!q) return true;
  const hay = [
    call.name, call.phone, call.address, call.notes
  ].join(" ").toLowerCase();
  return hay.includes(q);
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

 let selectedId = null;
let ctxTargetId = null;

const ctx = document.getElementById("ctx");
const ctxMenu = document.getElementById("ctxMenu");

function closeCtx(){
  ctx.classList.add("hidden");
  ctx.setAttribute("aria-hidden","true");
  ctxTargetId = null;
}
function openCtx(x,y,id){
  ctxTargetId = id;
  ctx.classList.remove("hidden");
  ctx.setAttribute("aria-hidden","false");
  ctxMenu.style.left = `${x}px`;
  ctxMenu.style.top = `${y}px`;
}

function selectCard(id){
  selectedId = id;
  document.querySelectorAll(".card").forEach(c => c.classList.remove("selected"));
  const card = document.querySelector(`.card[data-id="${id}"]`);
  if(card) card.classList.add("selected");
}

function wireCardButtons() {
  // Call button
  el.cards.querySelectorAll(".btn-call").forEach(btn => {
    if (btn.disabled) return;
    btn.addEventListener("click", () => {
      const tel = btn.getAttribute("data-tel");
      if (tel) window.location.href = tel;
    });
  });

  // Status dropdown
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

  // Edit / Delete per card
  el.cards.querySelectorAll(".card").forEach(card => {
    const id = card.getAttribute("data-id");

    // click selects card (Windows-style)
    card.addEventListener("click", (e) => {
      // don't steal focus when clicking buttons/selects
      if (e.target.closest("button") || e.target.closest("select")) return;
      selectCard(id);
    });

    // right-click context menu
    card.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      selectCard(id);
      openCtx(e.clientX, e.clientY, id);
    });

    const btnEdit = card.querySelector(".btn-edit");
    const btnDelete = card.querySelector(".btn-delete");

    if (btnEdit) {
      btnEdit.addEventListener("click", () => {
        const call = state.calls.find(c => c.id === id);
        if (!call) return;
        selectCard(id);
        openModal("edit", call);
      });
    }

    if (btnDelete) {
      btnDelete.addEventListener("click", () => {
        const call = state.calls.find(c => c.id === id);
        if (!call) return;
        const ok = confirm(`Delete service call for "${call.name}"?`);
        if (!ok) return;

        state.calls = state.calls.filter(c => c.id !== id);
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
    render();
    selectedId = null;
  }

  if (e.key === "Escape") {
    closeCtx();
  }
});
        saveCalls();
        render();
      });
    }
  });
}

/* context menu clicks */
ctx?.addEventListener("click", (e)=> {
  if(e.target === ctx) closeCtx();
});

document.querySelectorAll(".ctx-item").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    const action = btn.getAttribute("data-action");
    const id = ctxTargetId;
    if(!id) return closeCtx();

    const call = state.calls.find(c=>c.id===id);
    if(!call) return closeCtx();

    if(action==="call" && call.phone){
      window.location.href = "tel:" + call.phone.replace(/\s+/g,"");
    }
    if(action==="edit"){
      openModal("edit", call);
    }
    if(action==="complete"){
      call.status="done";
      saveCalls();
      render();
    }
    if(action==="delete"){
      const ok = confirm(`Delete service call for "${call.name}"?`);
      if(ok){
        state.calls = state.calls.filter(c=>c.id!==id);
        saveCalls();
        render();
      }
    }
    closeCtx();
  }); 
}

function cardHTML(call) {
  const phone = (call.phone || "").trim();
  const address = (call.address || "").trim();
  const notes = (call.notes || "").trim();

  const subLines = [];
  if (phone) subLines.push(`📞 ${escapeHTML(phone)}`);
  if (address) subLines.push(`📍 ${escapeHTML(address)}`);
  if (notes) subLines.push(`📝 ${escapeHTML(notes)}`);

  const telHref = phone ? `tel:${encodeURIComponent(phone.replace(/\s+/g,""))}` : "";

  return `
    <article class="card" data-id="${call.id}">
      <div class="row">
        <div>
          <h3 class="title">${escapeHTML(call.name || "Unnamed")}</h3>
          <p class="sub">${subLines.length ? subLines.join("<br>") : `<span style="color:var(--muted)">No details yet</span>`}</p>
        </div>
        <div class="badges">
          ${badgePriority(call.priority)}
          ${badgeStatus(call.status)}
        </div>
      </div>

      <div class="actions">
        <button class="btn primary btn-call" type="button" ${phone ? "" : "disabled"} data-tel="${telHref}">
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

function wireCardButtons() {
  const cards = Array.from(el.cards.querySelectorAll(".card"));

  // Call button
  el.cards.querySelectorAll(".btn-call").forEach(btn => {
    if (btn.disabled) return;
    btn.addEventListener("click", () => {
      const tel = btn.getAttribute("data-tel");
      if (tel) window.location.href = tel;
    });
  });

  // Status dropdown
  el.cards.querySelectorAll(".status-select").forEach(sel => {
    sel.addEventListener("change", () => {
      const id = sel.getAttribute("data-id");
      const idx = state.calls.findIndex(c => c.id === id);
      if (idx === -1) return;
      state.calls[idx].status = sel.value;
      saveCalls();
      render();
    });
  });

  // Edit / Delete per card
  for (const card of cards) {
    const id = card.getAttribute("data-id");
    const btnEdit = card.querySelector(".btn-edit");
    const btnDelete = card.querySelector(".btn-delete");

    if (btnEdit) {
      btnEdit.addEventListener("click", () => {
        const call = state.calls.find(c => c.id === id);
        if (!call) return;
        openModal("edit", call);
      });
    }

    if (btnDelete) {
      btnDelete.addEventListener("click", () => {
        const call = state.calls.find(c => c.id === id);
        if (!call) return;
        const ok = confirm(`Delete service call for "${call.name}"?`);
        if (!ok) return;

        state.calls = state.calls.filter(c => c.id !== id);
        saveCalls();
        render();
      });
    }
  }
}

function escapeHTML(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* Events */
el.btnNew.addEventListener("click", () => openModal("new"));
el.btnNewEmpty.addEventListener("click", () => openModal("new"));
el.btnClose.addEventListener("click", closeModal);
el.btnCancel.addEventListener("click", closeModal);

el.overlay.addEventListener("click", (e) => {
  if (e.target === el.overlay) closeModal();
});

el.form.addEventListener("submit", (e) => {
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
    }
  } else {
    state.calls.unshift({
      id: uid(),
      createdAt: Date.now(),
      ...payload,
    });
  }

  saveCalls();
  closeModal();
  render();
});

el.chips.forEach(chip => {
  chip.addEventListener("click", () => {
    el.chips.forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    state.filter = chip.getAttribute("data-filter") || "all";
    render();
  });
});

el.search.addEventListener("input", () => {
  state.query = el.search.value || "";
  render();
});

/* Kickoff */
render();
