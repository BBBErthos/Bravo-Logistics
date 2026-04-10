// ── Config ────────────────────────────────────────────────────────────────────
const TOKEN    = "eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjY0MjAyOTczNSwiYWFpIjoxMSwidWlkIjoxMDE2NTU1NDEsImlhZCI6IjIwMjYtMDQtMDZUMTY6MTU6NDEuMDAwWiIsInBlciI6Im1lOndyaXRlIiwiYWN0aWQiOjM0MDM3NTMzLCJyZ24iOiJ1c2UxIn0.xhq8Fz24KVtwvLHPuxUR4lZ6Y_WoZHvximfIa9hmnYM";
const DEL_BOARD = "18407062173";

const EJS_PUBLIC_KEY  = "jd_aZusTeEuo9B1Jw";
const EJS_SERVICE_ID  = "service_vwvutqf";
const EJS_CONFIRM_TPL = "template_a4j8kyk";

const DEL_COL = {
  bol:      "text_mm21d399",
  carrier:  "text_mm21mxr7",
  email:    "text_mm21nbps",
  timeSlot: "dropdown_mm21hph6",
  status:   "color_mm21zhcs",
  date:     "date_mm21td8v",
  poNumber: "text_mm29xaqd",
  yard:     "color_mm29fpxq"
};

// YARD_IDX removed — Yard is now a Status column, write as {label: "Yard A"}

const PRIMARY_SLOTS = [
  { label: "0730–0830", idx: 0 },
  { label: "0830–0930", idx: 1 },
  { label: "0930–1030", idx: 2 },
  { label: "1030–1130", idx: 3 },
  { label: "1130–1230", idx: 4 },
  { label: "1230–1330", idx: 5 },
  { label: "1330–1430", idx: 6 },
  { label: "1430–1530", idx: 7 },
  { label: "1530–1630", idx: 8 }
];

const OVERFLOW_SLOTS = [
  { label: "0800–0900", idx: 9  },
  { label: "0900–1000", idx: 10 },
  { label: "1000–1100", idx: 11 },
  { label: "1100–1200", idx: 12 },
  { label: "1200–1300", idx: 13 },
  { label: "1300–1400", idx: 14 },
  { label: "1400–1500", idx: 15 },
  { label: "1500–1600", idx: 16 }
];

// Slot label → Monday dropdown label mapping
const SLOT_MONDAY_LABEL = {
  0: "0730-0830", 1: "0830-0930", 2: "0930-1030",  3: "1030-1130",
  4: "1130-1230", 5: "1230-1330", 6: "1330-1430",  7: "1430-1530",
  8: "1530-1630", 9: "0800-0900", 10: "0900-1000", 11: "1000-1100",
  12: "1100-1200", 13: "1200-1300", 14: "1300-1400", 15: "1400-1500",
  16: "1500-1600"
};

let itemId       = null;
let itemRef      = null;
let requestData  = {};
let bookedSlots  = [];
let selectedSlot = null;

// ── GQL ───────────────────────────────────────────────────────────────────────
async function gql(query, variables = {}) {
  const r = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: { "Authorization": TOKEN, "Content-Type": "application/json", "API-Version": "2024-01" },
    body: JSON.stringify({ query, variables })
  });
  const d = await r.json();
  if (d.errors) throw new Error(d.errors[0].message);
  return d.data;
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", init);
window.addEventListener("load", init);
let _inited = false;
async function init() {
  if (_inited) return;
  _inited = true;

  // Init EmailJS safely

  // Parse URL params
  const params = new URLSearchParams(window.location.search);
  itemId   = params.get("id");
  itemRef  = params.get("ref");

  if (!itemId) {
    showError();
    return;
  }

  document.getElementById("fid").textContent = itemRef || itemId;

  try {
    await loadRequest();
  } catch(e) {
    showError();
  }
}

// ── Load request from Monday ──────────────────────────────────────────────────
async function loadRequest() {
  // Try direct items query first (works in some API versions)
  // Fall back to items_page if needed
  let item = null;

  try {
    // Approach 1: direct items query with next_items_page for v2024-01
    const d1 = await gql(`
      query {
        boards(ids:[${DEL_BOARD}]) {
          items_page(limit:500) {
            items {
              id name
              column_values { id text }
            }
          }
        }
      }
    `);
    const allItems = d1.boards[0].items_page.items;
    item = allItems.find(i => String(i.id) === String(itemId));
  } catch(e) {
    console.error("Query failed:", e);
  }

  if (!item) {
    // Show debug info on screen
    document.getElementById("stateLoading").classList.add("hidden");
    document.getElementById("stateError").classList.remove("hidden");
    document.getElementById("stateError").querySelector("p").textContent =
      `Debug: Looking for item ID "${itemId}" — check browser console for details. Total items queried shown in console.`;
    return;
  }
  const cv = {};
  item.column_values.forEach(c => { cv[c.id] = c.text || ""; });

  // Debug: log all column values to verify mapping
  console.log("Item name:", item.name);
  console.log("Column values:", cv);

  requestData = {
    ref:      itemRef || item.name,
    po:       cv[DEL_COL.poNumber] || "—",
    date:     cv[DEL_COL.date]     || "",
    carrier:  cv[DEL_COL.carrier]  || "—",
    bol:      cv[DEL_COL.bol]      || "—",
    email:    cv[DEL_COL.email]    || "—",
    status:   cv[DEL_COL.status]   || "—"
  };

  // Check if already confirmed
  if (requestData.status === "Scheduled") {
    showAlreadyConfirmed();
    return;
  }

  // Populate summary
  document.getElementById("reqRef").textContent     = requestData.ref;
  document.getElementById("reqPO").textContent      = requestData.po;
  document.getElementById("reqDate").textContent    = requestData.date;
  document.getElementById("reqCarrier").textContent = requestData.carrier;
  document.getElementById("reqBOL").textContent     = requestData.bol;
  document.getElementById("reqEmail").textContent   = requestData.email;
  document.getElementById("reqStatus").textContent  = requestData.status;

  // Pre-fill date with dispatcher's preferred date
  if (requestData.date) {
    const dateInput = document.getElementById("cDate");
    const today = new Date().toISOString().split("T")[0];
    const max   = new Date();
    max.setDate(max.getDate() + 7);
    dateInput.min   = today;
    dateInput.max   = max.toISOString().split("T")[0];
    dateInput.value = requestData.date;
  }

  // Show form
  document.getElementById("stateLoading").classList.add("hidden");
  document.getElementById("fw").classList.remove("hidden");
}

function showError() {
  document.getElementById("stateLoading").classList.add("hidden");
  document.getElementById("stateError").classList.remove("hidden");
}

function showAlreadyConfirmed() {
  document.getElementById("stateLoading").classList.add("hidden");
  document.getElementById("stateError").classList.remove("hidden");
  document.getElementById("stateError").querySelector("h2").textContent = "Already confirmed";
  document.getElementById("stateError").querySelector("p").textContent =
    "This delivery appointment has already been confirmed.";
}

// ── Yard / date change ────────────────────────────────────────────────────────
async function onYardDateChange() {
  const yard = document.getElementById("cYard").value;
  const date = document.getElementById("cDate").value;
  selectedSlot = null;

  if (!yard || !date) {
    document.getElementById("slotArea").innerHTML =
      '<div style="padding:24px;text-align:center;color:var(--text3);font-size:13px">Select a yard above to see available time slots.</div>';
    document.getElementById("slotStatusBar").style.display = "none";
    return;
  }

  document.getElementById("slotArea").innerHTML =
    '<div class="slot-loading"><div class="spin"></div>Checking availability...</div>';
  document.getElementById("slotStatusBar").style.display = "none";

  try {
    bookedSlots = await fetchBookedSlots(date, yard);
    renderSlots();
  } catch(e) {
    toast("Could not check availability: " + e.message, "error");
  }
}

// ── Fetch booked slots ────────────────────────────────────────────────────────
async function fetchBookedSlots(date, yard) {
  const d = await gql(`
    query {
      boards(ids:[${DEL_BOARD}]) {
        items_page(limit:200) {
          items {
            id
            column_values { id text }
          }
        }
      }
    }
  `);

  const booked = [];
  d.boards[0].items_page.items.forEach(item => {
    if (String(item.id) === String(itemId)) return;
    let itemDate = null, itemYard = null, itemSlot = null;
    item.column_values.forEach(cv => {
      if (cv.id === DEL_COL.date     && cv.text) itemDate = cv.text;
      if (cv.id === DEL_COL.yard     && cv.text) itemYard = cv.text;
      if (cv.id === DEL_COL.timeSlot && cv.text) itemSlot = cv.text;
    });
    if (itemDate === date && itemYard === yard && itemSlot) {
      const allSlots = [...PRIMARY_SLOTS, ...OVERFLOW_SLOTS];
      const found = allSlots.find(s =>
        s.label.replace("–","-") === itemSlot.replace("–","-") || s.label === itemSlot
      );
      if (found) booked.push(found.idx);
    }
  });
  return booked;
}

// ── Render slots ──────────────────────────────────────────────────────────────
function renderSlots() {
  const area = document.getElementById("slotArea");
  const primaryBooked  = PRIMARY_SLOTS.filter(s => bookedSlots.includes(s.idx)).length;
  const allPrimaryFull = primaryBooked === PRIMARY_SLOTS.length;
  const totalOpen = [...PRIMARY_SLOTS, ...(allPrimaryFull ? OVERFLOW_SLOTS : [])].filter(s => !bookedSlots.includes(s.idx)).length;

  let html = '<div class="slot-grid">';
  PRIMARY_SLOTS.forEach(slot => {
    const isBooked   = bookedSlots.includes(slot.idx);
    const isSelected = selectedSlot && selectedSlot.idx === slot.idx;
    const cls = isBooked ? "booked" : isSelected ? "selected" : "";
    const tag = isBooked ? "Booked" : "Available";
    const tagCls = isBooked ? "" : "open";
    html += `<div class="slot ${cls}" onclick="selectSlot(${slot.idx}, '${slot.label}')">
      <div class="slot-time">${slot.label}</div>
      <div class="slot-tag ${tagCls}">${tag}</div>
    </div>`;
  });
  html += '</div>';

  if (allPrimaryFull) {
    html += `<div class="overflow-label">▸ Overflow slots — primary schedule full</div>`;
    html += '<div class="slot-grid">';
    OVERFLOW_SLOTS.forEach(slot => {
      const isBooked   = bookedSlots.includes(slot.idx);
      const isSelected = selectedSlot && selectedSlot.idx === slot.idx;
      const cls = isBooked ? "booked" : isSelected ? "selected" : "";
      const tag = isBooked ? "Booked" : "Available";
      const tagCls = isBooked ? "" : "open";
      html += `<div class="slot ${cls}" onclick="selectSlot(${slot.idx}, '${slot.label}')">
        <div class="slot-time">${slot.label}</div>
        <div class="slot-tag ${tagCls}">${tag}</div>
      </div>`;
    });
    html += '</div>';
  } else {
    html += `<div class="overflow-label" style="opacity:.4">▸ Overflow slots — available when primary schedule is full</div>`;
    html += '<div class="slot-grid">';
    OVERFLOW_SLOTS.forEach(slot => {
      html += `<div class="slot locked"><div class="slot-time">${slot.label}</div><div class="slot-tag">Locked</div></div>`;
    });
    html += '</div>';
  }

  area.innerHTML = html;

  const bar = document.getElementById("slotStatusBar");
  bar.style.display = "flex";
  document.getElementById("slotOpen").textContent   = `${totalOpen} slots open`;
  document.getElementById("slotBooked").textContent = `${bookedSlots.length} booked`;
  document.getElementById("slotSelected").textContent = selectedSlot
    ? `Selected: ${selectedSlot.label}` : "No slot selected";
}

function selectSlot(idx, label) {
  if (bookedSlots.includes(idx)) return;
  const isOverflow = OVERFLOW_SLOTS.some(s => s.idx === idx);
  const allPrimaryFull = PRIMARY_SLOTS.filter(s => bookedSlots.includes(s.idx)).length === PRIMARY_SLOTS.length;
  if (isOverflow && !allPrimaryFull) return;
  selectedSlot = { idx, label };
  renderSlots();
}

// ── Validate ──────────────────────────────────────────────────────────────────
function validate() {
  const errs = [];
  if (!document.getElementById("cYard").value) errs.push("Select a receiving yard");
  if (!document.getElementById("cDate").value) errs.push("Confirm the delivery date");
  if (!selectedSlot)                           errs.push("Select a time slot");
  return errs;
}

// ── Confirm ───────────────────────────────────────────────────────────────────
async function confirmAppt() {
  const errs = validate();
  if (errs.length) { toast(errs[0], "error"); return; }

  const btn = document.getElementById("subBtn");
  btn.disabled = true; btn.textContent = "Confirming...";

  const yard = document.getElementById("cYard").value;
  const date = document.getElementById("cDate").value;

  try {
    // Race condition guard — re-check slot
    const freshBooked = await fetchBookedSlots(date, yard);
    if (freshBooked.includes(selectedSlot.idx)) {
      toast("That slot was just booked. Please select another.", "error");
      bookedSlots = freshBooked;
      renderSlots();
      btn.disabled = false; btn.textContent = "Confirm appointment & notify dispatcher";
      return;
    }

    // Update Monday item using variables to avoid JSON escaping issues
    const updateCol = async (colId, val) => {
      await gql(
        `mutation($b:ID!,$i:ID!,$c:String!,$v:JSON!){ change_column_value(board_id:$b,item_id:$i,column_id:$c,value:$v){ id } }`,
        { b: DEL_BOARD, i: itemId, c: colId, v: JSON.stringify(val) }
      );
    };
    await updateCol(DEL_COL.date,     date);
    await updateCol(DEL_COL.status,   { label: "Scheduled" });
    await updateCol(DEL_COL.yard,     { label: yard });
    await updateCol(DEL_COL.timeSlot, { ids: [selectedSlot.idx] });

    // Send confirmation email to dispatcher
    const slotLabel = SLOT_MONDAY_LABEL[selectedSlot.idx] || selectedSlot.label;
    await sendEmail(EJS_CONFIRM_TPL, {
      to_email:  requestData.email,
      carrier:   requestData.carrier,
      reference: requestData.ref,
      date:      date,
      po_number: requestData.po,
      yard:      yard,
      time_slot: slotLabel
    });

    showSuccess(requestData.ref, date, yard, selectedSlot.label, requestData.po, requestData.carrier, requestData.bol);

  } catch(e) {
    toast("Confirmation failed: " + e.message, "error");
    btn.disabled = false; btn.textContent = "Confirm appointment & notify dispatcher";
  }
}

// ── Success ───────────────────────────────────────────────────────────────────
function showSuccess(ref, date, yard, slot, po, carrier, bol) {
  document.getElementById("fw").classList.add("hidden");
  document.getElementById("ss").classList.add("vis");
  document.getElementById("ssid").textContent = ref;
  document.getElementById("sconf").innerHTML = `
    <div class="conf-row"><span>Reference</span><span>${ref}</span></div>
    <div class="conf-row"><span>Date</span><span>${date}</span></div>
    <div class="conf-row"><span>Yard</span><span>${yard}</span></div>
    <div class="conf-row"><span>Time Slot</span><span>${slot}</span></div>
    <div class="conf-row"><span>PO Number</span><span>${po}</span></div>
    <div class="conf-row"><span>Carrier</span><span>${carrier}</span></div>
    <div class="conf-row"><span>BOL #</span><span>${bol}</span></div>
  `;
  toast(`Appointment confirmed — confirmation sent to ${requestData.email}`, "success");
}

// ── EmailJS direct API (no SDK) ───────────────────────────────────────────────
async function sendEmail(templateId, params) {
  const r = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id:  EJS_SERVICE_ID,
      template_id: templateId,
      user_id:     EJS_PUBLIC_KEY,
      template_params: params
    })
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`EmailJS error ${r.status}: ${txt}`);
  }
  return true;
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type = "info") {
  const c = document.getElementById("toasts");
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  const ic = type === "success" ? "✓" : type === "error" ? "✕" : "ℹ";
  t.innerHTML = `<span style="font-family:var(--mono)">${ic}</span> ${msg}`;
  c.appendChild(t);
  setTimeout(() => {
    t.style.cssText = "opacity:0;transform:translateX(20px);transition:all .3s";
    setTimeout(() => t.remove(), 300);
  }, type === "error" ? 7000 : 4000);
}