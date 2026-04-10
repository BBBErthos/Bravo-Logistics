// ── Config ────────────────────────────────────────────────────────────────────
const TOKEN    = "eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjY0MjAyOTczNSwiYWFpIjoxMSwidWlkIjoxMDE2NTU1NDEsImlhZCI6IjIwMjYtMDQtMDZUMTY6MTU6NDEuMDAwWiIsInBlciI6Im1lOndyaXRlIiwiYWN0aWQiOjM0MDM3NTMzLCJyZ24iOiJ1c2UxIn0.xhq8Fz24KVtwvLHPuxUR4lZ6Y_WoZHvximfIa9hmnYM";
const MM_BOARD  = "18407396726";
const DEL_BOARD = "18407062173";

// EmailJS config
const EJS_PUBLIC_KEY   = "jd_aZusTeEuo9B1Jw";
const EJS_SERVICE_ID   = "service_vwvutqf";
const EJS_REQUEST_TPL  = "template_89pfqxd";

// Delivery board column IDs
const DEL_COL = {
  bol:      "text_mm21d399",
  carrier:  "text_mm21mxr7",
  email:    "text_mm21nbps",
  timeSlot: "dropdown_mm21hph6",
  status:   "color_mm21zhcs",
  date:     "date_mm21td8v",
  poNumber: "text_mm29xaqd"
  yard:     "color_mm29fpxq"
};

// Confirm form base URL — update if hosted elsewhere
const CONFIRM_BASE_URL = "https://bbberthos.github.io/Bravo-Logistics/bravo_delivery_confirm_v1.html";

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", init);
window.addEventListener("load", init);
let _inited = false;
async function init() {
  if (_inited) return;
  _inited = true;
  setDateLimits();
  genId();
  await loadPOs();
}

function p2(n) { return String(n).padStart(2, "0"); }

function genId() {
  const d = new Date();
  const s = `${d.getFullYear()}${p2(d.getMonth()+1)}${p2(d.getDate())}`;
  document.getElementById("fid").textContent = `DEL-${s}-${String(Math.floor(Math.random()*900)+100)}`;
}

function setDateLimits() {
  const today = new Date();
  const max   = new Date();
  max.setDate(today.getDate() + 7);
  const fmt = d => d.toISOString().split("T")[0];
  const input = document.getElementById("dDate");
  input.min   = fmt(today);
  input.max   = fmt(max);
  input.value = fmt(today);
}

// ── Load POs ──────────────────────────────────────────────────────────────────
async function gql(query, variables = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const r = await fetch("https://api.monday.com/v2", {
      method: "POST",
      headers: { "Authorization": TOKEN, "Content-Type": "application/json", "API-Version": "2024-01" },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    const d = await r.json();
    if (d.errors) throw new Error(d.errors[0].message);
    return d.data;
  } catch(e) {
    clearTimeout(timeout);
    if (e.name === "AbortError") throw new Error("Request timed out — check network connection");
    throw e;
  }
}

async function loadPOs() {
  try {
    let cursor = null, all = new Set(), page = 0;
    do {
      page++;
      const q = cursor
        ? `query { boards(ids:[${MM_BOARD}]) { items_page(limit:200,cursor:"${cursor}") { cursor items { name } } } }`
        : `query { boards(ids:[${MM_BOARD}]) { items_page(limit:200) { cursor items { name } } } }`;
      const d = await gql(q);
      const pg = d.boards[0].items_page;
      cursor = pg.cursor;
      pg.items.forEach(i => { if(i.name) all.add(i.name); });
    } while (cursor && page < 20);

    const pos = [...all].sort();
    const sel = document.getElementById("dPO");
    sel.innerHTML = '<option value="">Select PO number...</option>';
    pos.forEach(po => {
      const o = document.createElement("option");
      o.value = o.textContent = po;
      sel.appendChild(o);
    });
    const st = document.getElementById("poStatus");
    st.textContent = `✓ ${pos.length} POs available`;
    st.style.color = "var(--green)";
  } catch(e) {
    console.error("loadPOs failed:", e);
    toast("Could not load PO numbers: " + e.message, "error");
    const sel = document.getElementById("dPO");
    sel.innerHTML = `<option value="">✗ Error: ${e.message}</option>`;
    document.getElementById("poStatus").textContent = "✗ Failed: " + e.message;
    document.getElementById("poStatus").style.color = "var(--red)";
  }
}

// ── Validate ──────────────────────────────────────────────────────────────────
function validate() {
  const errs = [];
  if (!document.getElementById("dPO").value)             errs.push("PO Number is required");
  if (!document.getElementById("dDate").value)           errs.push("Preferred date is required");
  if (!document.getElementById("dBOL").value.trim())     errs.push("BOL number is required");
  if (!document.getElementById("dCarrier").value.trim()) errs.push("Carrier company is required");
  const email = document.getElementById("dEmail").value.trim();
  if (!email)                                            errs.push("Email address is required");
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))   errs.push("Please enter a valid email address");
  return errs;
}

// ── Submit ────────────────────────────────────────────────────────────────────
async function submitRequest() {
  const errs = validate();
  if (errs.length) { toast(errs[0], "error"); return; }

  const btn = document.getElementById("subBtn");
  btn.disabled = true; btn.textContent = "Submitting...";

  const po      = document.getElementById("dPO").value;
  const date    = document.getElementById("dDate").value;
  const bol     = document.getElementById("dBOL").value.trim();
  const carrier = document.getElementById("dCarrier").value.trim();
  const email   = document.getElementById("dEmail").value.trim();
  const notes   = document.getElementById("dNotes").value.trim();
  const dateStr = date.replace(/-/g, "");
  const ref     = `DEL-${dateStr}-${String(Math.floor(Math.random()*900)+100)}`;

  try {
    // Step 1: Create pending item on Delivery Schedule board
    const colVals = {
      [DEL_COL.date]:    date,
      [DEL_COL.bol]:     bol,
      [DEL_COL.carrier]: carrier,
      [DEL_COL.email]:   email,
      [DEL_COL.status]:  { label: "Pending" }
    };

    // PO Number — plain text column
    const poVal = document.getElementById("dPO").value;
    if (poVal) colVals[DEL_COL.poNumber] = poVal;

    const result = await gql(
      `mutation($b:ID!,$g:String!,$n:String!,$cv:JSON!){create_item(board_id:$b,group_id:$g,item_name:$n,column_values:$cv){id name}}`,
      { b: DEL_BOARD, g: "topics", n: ref, cv: JSON.stringify(colVals) }
    );

    const itemId = result.create_item.id;
    const confirmLink = `${CONFIRM_BASE_URL}?id=${itemId}&ref=${encodeURIComponent(ref)}`;

    // Step 2: Send email to logistics coordinator
    await sendEmail(EJS_REQUEST_TPL, {
      reference:      ref,
      preferred_date: date,
      po_number:      po,
      carrier:        carrier,
      bol:            bol,
      carrier_email:  email,
      notes:          notes || "None",
      confirm_link:   confirmLink
    });

    showSuccess(ref, email);

  } catch(e) {
    toast("Submission failed: " + e.message, "error");
    btn.disabled = false; btn.textContent = "Submit delivery request";
  }
}

// ── Success ───────────────────────────────────────────────────────────────────
function showSuccess(ref, email) {
  document.getElementById("fw").classList.add("hidden");
  document.getElementById("ss").classList.add("vis");
  document.getElementById("ssid").textContent = ref;
  document.getElementById("ssEmail").textContent = email;
  toast("Request submitted — coordinator notified ✓", "success");
}

// ── Reset / clear ─────────────────────────────────────────────────────────────
function reset() {
  document.getElementById("fw").classList.remove("hidden");
  document.getElementById("ss").classList.remove("vis");
  clearForm(); genId();
}

function clearForm() {
  setDateLimits();
  document.getElementById("dPO").selectedIndex = 0;
  ["dBOL","dCarrier","dEmail","dNotes"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("subBtn").disabled    = false;
  document.getElementById("subBtn").textContent = "Submit delivery request";
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
  t.innerHTML = `<span style="font-family:var(--mono)">${ic}</span> ${ms