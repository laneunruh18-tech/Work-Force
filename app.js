/* Work Force — Chunk 1
   - Add service calls
   - Priority + status
   - Filter chips
   - Persistent storage (localStorage)
   - Delete call
   - (Edit + swipe coming in Chunk 2/3)
*/

const STORAGE_KEY = "workforce_calls_v1";

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
  name: document.getElementById("name"),
  phone: document.getElementById("phone"),
  address: document.getElementById("address"),
  priority: document.getElementById("priority"),
  status: document.getElementById("status"),
  notes: document.getElementById("notes"),
};

let state = {
  calls: loadCalls(),
  filter: "all",
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function loadCalls() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(data)) return [];
    return data;
  } catch {
    return [];
  }
}

function saveCalls() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.calls));
}

function openModal() {
  el.overlay.classList.remove("hidden");
  el.overlay.setAttribute("aria-hidden", "false");
  setTimeout(() => el.name.focus(), 0);
}

function closeModal() {
  el.overlay.classList.add("hidden");
  el.overlay.setAttribute("aria-hidden", "true");
  el.form.reset();
  el.priority.value = "medium";
  el.status.value = "new";
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

function formatPhone(phone) {
  const p = (phone || "").trim();
  return p;
}

function badgePriority(priority) {
  const label = priority === "high" ? "High" : priority === "low" ? "Low" : "Medium";
  return `<span class="badge priority ${priority}">Priority: ${label}</span>`;
}

function badgeStatus(status) {
  return `<span class="badge">Status: ${formatStatus(status)}</span>`;
}

function render() {
  const calls = state.calls
    .slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const filtered =
    state.filter === "all"
      ? calls
      : calls.filter(c => c.status === state.filter);

  el.cards.innerHTML = filtered.map(cardHTML).join("");

  const hasAny = state.calls.length > 0;
  el.empty.style.display = hasAny ? "none" : "block";

  wireCardButtons();
}

function cardHTML(call) {
  const phone = formatPhone(call.phone);
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
        <button class="btn ghost btn-status" type="button">
          Next Status
        </button>
        <button class="btn ghost btn-delete" type="button">
          Delete
        </button>
      </div>
    </article>
  `;
}

function wireCardButtons() {
  const cards = Array.from(el.cards.querySelectorAll(".card"));

  for (const card of cards) {
    const id = card.getAttribute("data-id");
    const btnCall = card.querySelector(".btn-call");
    const btnStatus = card.querySelector(".btn-status");
    const btnDelete = card.querySelector(".btn-delete");

    if (btnCall && !btnCall.disabled) {
      btnCall.addEventListener("click", () => {
        const tel = btnCall.getAttribute("data-tel");
        if (tel) window.location.href = tel;
      });
    }

    if (btnStatus) {
      btnStatus.addEventListener("click", () => {
        const idx = state.calls.findIndex(c => c.id === id);
        if (idx === -1) return;
        state.calls[idx].status = nextStatus(state.calls[idx].status);
        saveCalls();
        render();
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

function nextStatus(status) {
  const order = ["new", "scheduled", "in_progress", "done"];
  const i = order.indexOf(status);
  return order[(i + 1) % order.length] || "new";
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
el.btnNew.addEventListener("click", openModal);
el.btnNewEmpty.addEventListener("click", openModal);
el.btnClose.addEventListener("click", closeModal);
el.btnCancel.addEventListener("click", closeModal);

el.overlay.addEventListener("click", (e) => {
  if (e.target === el.overlay) closeModal();
});

el.form.addEventListener("submit", (e) => {
  e.preventDefault();

  const call = {
    id: uid(),
    createdAt: Date.now(),
    name: el.name.value.trim(),
    phone: el.phone.value.trim(),
    address: el.address.value.trim(),
    priority: el.priority.value,
    status: el.status.value,
    notes: el.notes.value.trim(),
  };

  state.calls.unshift(call);
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

/* Kickoff */
render();
