// ─────────────────────────────────────────────────────────────────────────────
// Bravo Logistics — Shared Configuration
// config.js — load this FIRST in every HTML file before any form JS
//
// MONTHLY MAINTENANCE: When Monday.com token expires, update TOKEN only.
// All forms will pick up the new token automatically.
//
// Load order in HTML files:
//   <script src="config.js"></script>
//   <script src="auth.js"></script>         ← internal forms only
//   <script src="bravo_[form]_v[n].js"></script>
// ─────────────────────────────────────────────────────────────────────────────

const BRAVO_CONFIG = {

  // ── Monday.com API ──────────────────────────────────────────────────────────
  // Rotate this token when it expires (Monday.com profile → Developers → Tokens)
  TOKEN: "eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjY1NDg5OTkzNywiYWFpIjoxMSwidWlkIjoxMDE2NTU1NDEsImlhZCI6IjIwMjYtMDUtMDZUMTg6NDI6MTEuMzM5WiIsInBlciI6Im1lOndyaXRlIiwiYWN0aWQiOjM0MDM3NTMzLCJyZ24iOiJ1c2UxIn0.4Pgo0ZvrwXXFjy1ex7fJLpl7BYCM0YRUVIOhz0ECYRU",

  // ── Board IDs ───────────────────────────────────────────────────────────────
  MM_BOARD:  "18407396726",   // Material Master
  DEL_BOARD: "18407062173",   // Delivery Schedule
  MTF_BOARD: "18407069511",   // Material Transfer Forms
  REC_BOARD: "18407084838",   // Receipts

  // ── EmailJS ─────────────────────────────────────────────────────────────────
  EJS_PUBLIC_KEY:   "jd_aZusTeEuo9B1Jw",
  EJS_SERVICE_ID:   "service_vwvutqf",
  EJS_REQUEST_TPL:  "template_89pfqxd",   // Delivery request notification
  EJS_CONFIRM_TPL:  "template_a4j8kyk",   // Delivery confirmation

  // ── URLs ────────────────────────────────────────────────────────────────────
  CONFIRM_BASE_URL: "https://bbberthos.github.io/Bravo-Logistics/bravo_delivery_confirm_v1.html"
};

// ── Tooltip handler (shared across all forms) ─────────────────────────────────
document.addEventListener('click', function(e) {
  const btn = e.target.closest('.info-btn');
  if (btn) {
    e.stopPropagation();
    const isActive = btn.classList.contains('active');
    document.querySelectorAll('.info-btn.active').forEach(b => {
      b.classList.remove('active');
      const t = b.nextElementSibling;
      if (t && t.classList.contains('info-tip')) t.classList.remove('show');
    });
    if (!isActive) {
      btn.classList.add('active');
      const tip = btn.nextElementSibling;
      if (tip && tip.classList.contains('info-tip')) {
        tip.classList.add('show');
        const rect = btn.getBoundingClientRect();
        const vw = window.innerWidth;
        let left = rect.left + rect.width / 2 - 130;
        let top  = rect.top - 10;
        if (left < 12) left = 12;
        if (left + 260 > vw - 12) left = vw - 272;
        top = rect.top < 120 ? rect.bottom + 10 : rect.top - tip.offsetHeight - 10;
        if (top < 10) top = rect.bottom + 10;
        tip.style.left = left + 'px';
        tip.style.top  = top  + 'px';
      }
    }
  } else {
    document.querySelectorAll('.info-btn.active').forEach(b => {
      b.classList.remove('active');
      const t = b.nextElementSibling;
      if (t && t.classList.contains('info-tip')) t.classList.remove('show');
    });
  }
});
