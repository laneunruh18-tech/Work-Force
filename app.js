import {
  db,
  auth,
  callsCollection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "./firebase.js";

/* Work Force — Firebase Realtime Sync (Windows 11)
   - Auth gate (login required)
   - Firestore realtime sync across devices
   - List + Board + Drag/Drop scheduling
   - Desktop selection + right-click menu + hotkeys
*/

const STORAGE_DEBUG = false; // keep false

// ---------- Elements ----------
const el = {
  // top actions
  btnNew: document.getElementById("btnNew"),
  btnNewEmpty: document.getElementById("btnNewEmpty"),
  btnLogout: document.getElementById("btnLogout"),

  // auth overlay
  authOverlay: document.getElementById("authOverlay"),
  authForm: document.getElementById("authForm"),
  authEmail: document.getElementById("authEmail"),
  authPassword: document.getElementById("authPassword"),
  btnCreateAccount: document.getElementById("btnCreateAccount"),
  authMsg: document.getElementById("authMsg"),

  // modal
  overlay: document.getElementById("modalOverlay"),
  btnClose: document.getElementById("btnClose"),
  btnCancel: document.getElementById("btnCancel"),
  form: document.getElementById("callForm"),

  // views
  cards: document.getElementById("cards"),
  board: document.getElementById("board"),
  empty: document.getElementById("emptyState"),
  chips: Array.from(document.querySelectorAll(".chip")),
  search: document.getElementById("searchInput"),
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

// Context menu
const ctx = document.getElementById("ctx");
const ctxMenu = document.getElementById("ctxMenu");

// ---------- State ----------
let state = {
  calls: [],
  filter: "all",
  query: "",
  view: "list", // "list" | "board"
};

let selectedId = null;
let ctxTargetId = null;

let unsubscribeCalls = null;

// ---------- Helpers ----------
function escapeHTML(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizePhoneForTel(phone) {
  const p = (phone || "").trim();
  return p ? p.replace(/\s+/g, "") : "";
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

function toLocalInputValue(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
  const start = new Date();
  start.setHours(0,0,0,0);
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
    return {
      scheduledAt: null,
      status: call.status === "scheduled" ? "new" : (call.status || "new"),
    };
  }
  if (bucket === "done") {
    return { status: "done" };
  }

  const d = new Date(startOfToday());
  if (bucket === "today") d.setDate(d.getDate());
  if (bucket === "tomorrow") d.setDate(d.getDate() + 1);
  if (bucket === "week") d.setDate(d.getDate() + 2);
  d.setHours(9, 0, 0, 0);

  return { scheduledAt: d.getTime(), status: "scheduled" };
}

function fmtSchedule(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  return d.toLocaleString([], { weekday:"short", month:"short", day:"numeric", hour:"numeric", minute:"2-digit" });
}

// ---------- Auth UI ----------
function showAuth(msg = "") {
  el.authOverlay.classList.remove("hidden");
  el.authOverlay.setAttribute("aria-hidden", "false");
  el.authMsg.textContent = msg || "";
  setTimeout(() => el.authEmail?.focus(), 0);
}

function hideAuth() {
  el.authOverlay.classList.add("hidden");
  el.authOverlay.setAttribute("aria-hidden", "true");
  el.authMsg.textContent = "";
}

function setLoggedInUI(isIn) {
  if (el.btnLogout) el.btnLogout.style.display = isIn ? "inline-flex" : "none";
  if (el.btnNew) el.btnNew.disabled = !isIn;
}

// ---------- Firestore Sync ----------
function startCallsSync() {
  if (unsubscribeCalls) unsubscribeCalls();

  // Order newest first
  const q = query(callsCollection, orderBy("createdAt", "desc"));

  unsubscribeCalls = onSnapshot(q, (snap) => {
    const next = [];
    snap.forEach((d) => {
      next.push({ id: d.id, ...d.data() });
    });
    state.calls = next;
    if (STORAGE_DEBUG) console.log("SYNC calls:", next.length);
    render();
  }, (err) => {
    console.error("Firestore onSnapshot error:", err);
  });
}

function stopCallsSync() {
  if (unsubscribeCalls) unsubscribeCalls();
  unsubscribeCalls = null;
  state.calls = [];
  render();
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

// ---------- Render ----------
function badgePriority(priority) {
  const p = priority || "medium";
  return `<span class="badge priority ${p}">Priority: ${priorityLabel(p)}</span>`;
}

function badgeStatus(status) {
  return `<span class="badge">Status: ${escapeHTML(formatStatus(status || "new"))}</span>`;
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
          ${badgePriority(call.priority)}
          ${badgeStatus(call.status)}
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

function countInBucket(bucket) {
  const calls = getFilteredCalls();
  return calls.filter(c => bucketFor(c) === bucket).length;
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

function renderBoard() {
  const calls = getFilteredCalls();

  const buckets = {
    unscheduled: [],
    today: [],
    tomorrow: [],
    week: [],
    done: [],
  };

  for (const c of calls) buckets[bucketFor(c)].push(c);

  // priority sort within columns
  const p = { high: 3, medium: 2, low: 1 };
  for (const key of Object.keys(buckets)) {
    buckets[key].sort((a, b) => {
      const pa = p[a.priority || "medium"];
      const pb = p[b.priority || "medium"];
      if (pb !== pa) return pb - pa;

      const sa = a.scheduledAt || 0;
      const sb = b.scheduledAt || 0;
      if (sa !== sb) return sa - sb;
      return 0;
    });
  }

  el.board.innerHTML =
    boardColumn("Unscheduled", "unscheduled", buckets.unscheduled.map(c => cardHTML(c, { draggable: true })).join("")) +
    boardColumn("Today", "today", buckets.today.map(c => cardHTML(c, { draggable: true })).join("")) +
    boardColumn("Tomorrow", "tomorrow", buckets.tomorrow.map(c => cardHTML(c, { draggable: true })).join("")) +
    boardColumn("This Week", "week", buckets.week.map(c => cardHTML(c, { draggable: true })).join("")) +
    boardColumn("Completed", "done", buckets.done.map(c => cardHTML(c, { draggable: true })).join(""));

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

// ---------- Wiring (after render) ----------
function wireUIAfterRender(mode) {
  const root = mode === "board" ? el.board : el.cards;

  root.querySelectorAll(".btn-call").forEach(btn => {
    if (btn.disabled) return;
    btn.addEventListener("click", () => {
      const tel = btn.getAttribute("data-tel");
      if (tel) window.location.href = tel;
    });
  });

  root.querySelectorAll(".status-select").forEach(sel => {
    sel.addEventListener("change", async () => {
      const id = sel.getAttribute("data-id");
      const newStatus = sel.value;

      try {
        await updateDoc(doc(db, "calls", id), { status: newStatus });
        selectedId = id;
      } catch (e) {
        console.error(e);
        alert("Could not update status (check Firestore rules / auth).");
      }
    });
  });

  root.querySelectorAll(".card").forEach(card => {
    const id = card.getAttribute("data-id");

    card.addEventListener("click", (e) => {
      if (e.target.closest("button") || e.target.closest("select")) return;
      selectCard(id);
    });

    card.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      selectCard(id);
      openCtx(e.clientX, e.clientY, id);
    });

    card.querySelector(".btn-edit")?.addEventListener("click", () => {
      const call = state.calls.find(c => c.id === id);
      if (!call) return;
      selectCard(id);
      openModal("edit", call);
    });

    card.querySelector(".btn-delete")?.addEventListener("click", async () => {
      const call = state.calls.find(c => c.id === id);
      if (!call) return;
      const ok = confirm(`Delete service call for "${call.name}"?`);
      if (!ok) return;

      try {
        await deleteDoc(doc(db, "calls", id));
        if (selectedId === id) selectedId = null;
      } catch (e) {
        console.error(e);
        alert("Could not delete (check Firestore rules / auth).");
      }
    });

    if (mode === "board") {
      card.addEventListener("dragstart", (e) => {
        e.dataTransfer?.setData("text/plain", id);
        e.dataTransfer.effectAllowed = "move";
      });
    }
  });
}

function wireBoardDnD() {
  el.board.querySelectorAll(".board-col").forEach(col => {
    col.addEventListener("dragover", (e) => {
      e.preventDefault();
      col.classList.add("drag-over");
    });
    col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
    col.addEventListener("drop", async (e) => {
      e.preventDefault();
      col.classList.remove("drag-over");

      const id = e.dataTransfer?.getData("text/plain");
      if (!id) return;

      const bucket = col.getAttribute("data-bucket");
      const call = state.calls.find(c => c.id === id);
      if (!call) return;

      const patch = setScheduleForBucket(call, bucket);

      try {
        await updateDoc(doc(db, "calls", id), patch);
        selectedId = id;
      } catch (err) {
        console.error(err);
        alert("Could not move card (check Firestore rules / auth).");
      }
    });
  });
}

function prepareContextMenuBindings() {
  if (!ctx) return;

  ctx.addEventListener("click", (e) => {
    if (e.target === ctx) closeCtx();
  });

  // wipe previous handlers safely
  document.querySelectorAll(".ctx-item").forEach(btn => {
    btn.replaceWith(btn.cloneNode(true));
  });

  document.querySelectorAll(".ctx-item").forEach(btn => {
    btn.addEventListener("click", async () => {
      const action = btn.getAttribute("data-action");
      const id = ctxTargetId;
      if (!id) return closeCtx();

      const call = state.calls.find(c => c.id === id);
      if (!call) return closeCtx();

      try {
        if (action === "call") {
          if (call.phone) window.location.href = "tel:" + normalizePhoneForTel(call.phone);
        }

        if (action === "edit") {
          openModal("edit", call);
        }

        if (action === "complete") {
          await updateDoc(doc(db, "calls", id), { status: "done" });
          selectedId = id;
        }

        if (action === "delete") {
          const ok = confirm(`Delete service call for "${call.name}"?`);
          if (ok) {
            await deleteDoc(doc(db, "calls", id));
            if (selectedId === id) selectedId = null;
          }
        }
      } catch (e) {
        console.error(e);
        alert("Action failed (auth/rules?).");
      } finally {
        closeCtx();
      }
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

el.form?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const payload = {
    name: el.name.value.trim(),
    phone: el.phone.value.trim(),
    address: el.address.value.trim(),
    priority: el.priority.value,
    status: el.status.value,
    scheduledAt: fromLocalInputValue(el.scheduledAt.value),
    notes: el.notes.value.trim(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const editId = (el.editId.value || "").trim();

  try {
    if (editId) {
      const patch = { ...payload };
delete patch.createdAt;

await updateDoc(doc(db, "calls", editId), patch);
      selectedId = editId;
    } else {
      // Don’t send undefined fields
      const clean = { ...payload };
      if (clean.scheduledAt === null) clean.scheduledAt = null;
      const ref = await addDoc(callsCollection, clean);
      selectedId = ref.id;
    }
    closeModal();
  } catch (err) {
    console.error(err);
    console.error(err);
alert(`Save failed:\n${err?.code || ""}\n${err?.message || err}`);
  }
});

// chips
el.chips?.forEach(chip => {
  chip.addEventListener("click", () => {
    el.chips.forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    state.filter = chip.getAttribute("data-filter") || "all";
    render();
  });
});

// search
el.search?.addEventListener("input", () => {
  state.query = el.search.value || "";
  render();
});

// view toggle
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

// hotkeys
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
    updateDoc(doc(db, "calls", selectedId), { status: "done" }).catch(()=>{});
  }

  if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
    const call = state.calls.find(c => c.id === selectedId);
    if (!call) return;
    const ok = confirm(`Delete service call for "${call.name}"?`);
    if (!ok) return;
    deleteDoc(doc(db, "calls", selectedId)).catch(()=>{});
  }

  if (e.key === "Escape") closeCtx();
});

// auth form
el.authForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  el.authMsg.textContent = "Signing in…";

  try {
    await signInWithEmailAndPassword(auth, el.authEmail.value.trim(), el.authPassword.value);
    el.authMsg.textContent = "";
  } catch (err) {
    console.error(err);
    el.authMsg.textContent = "Sign in failed. Check email/password.";
  }
});

el.btnCreateAccount?.addEventListener("click", async () => {
  el.authMsg.textContent = "Creating account…";
  try {
    await createUserWithEmailAndPassword(auth, el.authEmail.value.trim(), el.authPassword.value);
    el.authMsg.textContent = "";
  } catch (err) {
    console.error(err);
    el.authMsg.textContent = "Create failed (password too short? email in use?).";
  }
});

el.btnLogout?.addEventListener("click", async () => {
  await signOut(auth);
});

// ---------- Startup ----------
prepareContextMenuBindings();
setLoggedInUI(false);
showAuth("");

onAuthStateChanged(auth, (user) => {
  if (user) {
    hideAuth();
    setLoggedInUI(true);
    startCallsSync(); // ✅ realtime sync starts here
  } else {
    setLoggedInUI(false);
    stopCallsSync();
    showAuth("Please sign in.");
  }
});
