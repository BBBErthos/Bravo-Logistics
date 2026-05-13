// ─────────────────────────────────────────────────────────────────────────────
// Bravo Logistics — MSAL Authentication Scaffold
// auth.js — include in all forms that require SSO
//
// SETUP: When IT provides credentials, fill in the three constants below.
// All other code is ready to go.
//
// FORMS USING AUTH (internal staff only):
//   auth.js + requireAuth() in init():
//   ✓ index.html
//   ✓ bravo_checkin_v2.html          — Gate Marshal
//   ✓ bravo_yard_receipt_v2.html     — Yard Lead
//   ✓ bravo_receipt_no_appt_v2.html  — Admin/standalone
//   ✓ bravo_mtf_form_v4.html         — Yard Lead
//
// FORMS WITHOUT AUTH (external/public):
//   ✗ bravo_delivery_request_v1.html — Dispatcher/carrier (external)
//   ✗ bravo_delivery_confirm_v2.html — Coordinator (email link, no login)
//
// Required from IT / Azure Portal:
//   TENANT_ID  — Azure Active Directory Tenant ID
//   CLIENT_ID  — Application (Client) ID from App Registration
//   REDIRECT_URI — Must match exactly what is registered in Azure Portal
//                  e.g. https://bbberthos.github.io/Bravo-Logistics/
// ─────────────────────────────────────────────────────────────────────────────

const MSAL_CONFIG = {
  TENANT_ID:    "",   // ← paste Azure Tenant ID here
  CLIENT_ID:    "",   // ← paste Azure Application Client ID here
  REDIRECT_URI: window.location.origin + window.location.pathname.replace(/\/[^/]*$/, "/"),

  // Scopes requested at login
  // openid/profile/email = identity claims
  // Files.ReadWrite.All  = SharePoint uploads
  // User.Read            = basic profile
  SCOPES: [
    "openid",
    "profile",
    "email",
    "User.Read",
    "https://graph.microsoft.com/Files.ReadWrite.All"
  ]
};

// ─────────────────────────────────────────────────────────────────────────────
// MSAL instance — lazy-initialized on first call to getAuthInstance()
// ─────────────────────────────────────────────────────────────────────────────
let _msalInstance = null;
let _currentAccount = null;
let _accessToken    = null;

function getMsalConfig() {
  return {
    auth: {
      clientId:    MSAL_CONFIG.CLIENT_ID,
      authority:   `https://login.microsoftonline.com/${MSAL_CONFIG.TENANT_ID}`,
      redirectUri: MSAL_CONFIG.REDIRECT_URI,
    },
    cache: {
      cacheLocation:    "sessionStorage",
      storeAuthStateInCookie: false,
    }
  };
}

function getAuthInstance() {
  if (!_msalInstance) {
    if (!MSAL_CONFIG.CLIENT_ID || !MSAL_CONFIG.TENANT_ID) {
      console.warn("MSAL: CLIENT_ID and TENANT_ID not configured in auth.js");
      return null;
    }
    _msalInstance = new msal.PublicClientApplication(getMsalConfig());
  }
  return _msalInstance;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth state — AUTH_ENABLED controls whether login is required
// Set to false during development / before IT credentials arrive
// Set to true on deployment
// ─────────────────────────────────────────────────────────────────────────────
const AUTH_ENABLED = false; // ← set to true once CLIENT_ID and TENANT_ID are configured

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Call this at the top of each form's init() function.
 * If AUTH_ENABLED and user is not signed in, shows the login overlay.
 * Resolves immediately if AUTH_ENABLED is false.
 *
 * @returns {Promise<{name, email, token} | null>}
 */
async function requireAuth() {
  if (!AUTH_ENABLED) {
    updateAuthUI({ name: "Dev Mode", email: "dev@bravo.local", token: null });
    return { name: "Dev Mode", email: "dev@bravo.local", token: null };
  }

  const msalApp = getAuthInstance();
  if (!msalApp) return null;

  // Handle redirect response if returning from login
  try {
    const response = await msalApp.handleRedirectPromise();
    if (response) {
      _currentAccount = response.account;
      _accessToken    = response.accessToken;
    }
  } catch(e) {
    console.error("MSAL redirect error:", e);
  }

  // Check for existing account in cache
  const accounts = msalApp.getAllAccounts();
  if (accounts.length > 0) {
    _currentAccount = accounts[0];
    const token = await getToken();
    const user = {
      name:  _currentAccount.name  || _currentAccount.username,
      email: _currentAccount.username,
      token
    };
    updateAuthUI(user);
    return user;
  }

  // No account — show login overlay
  showLoginOverlay();
  return null;
}

/**
 * Silently get a fresh access token (for SharePoint API calls).
 * Falls back to popup if silent fails.
 *
 * @returns {Promise<string|null>}
 */
async function getToken() {
  if (!AUTH_ENABLED) return null;
  const msalApp = getAuthInstance();
  if (!msalApp || !_currentAccount) return null;

  try {
    const result = await msalApp.acquireTokenSilent({
      scopes:  MSAL_CONFIG.SCOPES,
      account: _currentAccount
    });
    _accessToken = result.accessToken;
    return _accessToken;
  } catch(e) {
    // Silent failed — try popup
    try {
      const result = await msalApp.acquireTokenPopup({ scopes: MSAL_CONFIG.SCOPES });
      _currentAccount = result.account;
      _accessToken    = result.accessToken;
      return _accessToken;
    } catch(e2) {
      console.error("MSAL token acquisition failed:", e2);
      return null;
    }
  }
}

/**
 * Trigger login popup.
 */
async function signIn() {
  const msalApp = getAuthInstance();
  if (!msalApp) return;
  try {
    const result = await msalApp.loginPopup({ scopes: MSAL_CONFIG.SCOPES });
    _currentAccount = result.account;
    _accessToken    = result.accessToken;
    hideLoginOverlay();
    const user = {
      name:  _currentAccount.name  || _currentAccount.username,
      email: _currentAccount.username,
      token: _accessToken
    };
    updateAuthUI(user);
    // Re-init the page now that user is authenticated
    if (typeof onAuthSuccess === "function") onAuthSuccess(user);
  } catch(e) {
    console.error("MSAL login failed:", e);
    showAuthError("Sign-in failed: " + (e.message || "Unknown error"));
  }
}

/**
 * Sign out and clear session.
 */
async function signOut() {
  const msalApp = getAuthInstance();
  if (!msalApp || !_currentAccount) return;
  await msalApp.logoutPopup({ account: _currentAccount });
  _currentAccount = null;
  _accessToken    = null;
  updateAuthUI(null);
  showLoginOverlay();
}

/**
 * Get current user info without triggering login.
 * Returns null if not signed in.
 */
function getCurrentUser() {
  if (!AUTH_ENABLED) return { name: "Dev Mode", email: "dev@bravo.local", token: null };
  if (!_currentAccount) return null;
  return {
    name:  _currentAccount.name || _currentAccount.username,
    email: _currentAccount.username,
    token: _accessToken
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// UI helpers — inject login overlay and user badge into the page
// ─────────────────────────────────────────────────────────────────────────────

function injectAuthStyles() {
  if (document.getElementById("bravo-auth-styles")) return;
  const style = document.createElement("style");
  style.id = "bravo-auth-styles";
  style.textContent = `
    /* Login overlay */
    #bravo-login-overlay {
      display: none; position: fixed; inset: 0; z-index: 9000;
      background: rgba(26,43,60,0.97);
      align-items: center; justify-content: center;
    }
    #bravo-login-overlay.vis { display: flex; }
    #bravo-login-card {
      background: #FFFFFF; border-radius: 12px; padding: 40px 36px;
      max-width: 400px; width: 90%; text-align: center;
      box-shadow: 0 24px 64px rgba(0,0,0,0.4);
    }
    #bravo-login-card .login-logo {
      width: 52px; height: 52px; background: #F5620F;
      clip-path: polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%);
      margin: 0 auto 16px; display: flex; align-items: center;
      justify-content: center;
    }
    #bravo-login-card h2 {
      font-family: 'IBM Plex Sans', 'Barlow', sans-serif;
      font-size: 22px; font-weight: 700; color: #1A2B3C; margin-bottom: 6px;
    }
    #bravo-login-card p {
      font-size: 14px; color: #6B7C8D; margin-bottom: 24px; line-height: 1.5;
    }
    #bravo-signin-btn {
      display: flex; align-items: center; justify-content: center; gap: 12px;
      width: 100%; padding: 14px 20px; border-radius: 8px; border: none;
      background: #0078D4; color: #fff; font-size: 15px; font-weight: 600;
      cursor: pointer; transition: background .15s; font-family: inherit;
    }
    #bravo-signin-btn:hover { background: #005A9E; }
    #bravo-signin-btn:disabled { opacity: .6; cursor: not-allowed; }
    .ms-logo { width: 20px; height: 20px; flex-shrink: 0; }
    #bravo-auth-error {
      display: none; margin-top: 12px; padding: 10px 14px;
      background: #FFEBEE; border: 1px solid #FFCDD2; border-radius: 6px;
      font-size: 13px; color: #C62828;
    }

    /* User badge in header */
    #bravo-user-badge {
      display: none; align-items: center; gap: 8px;
      font-size: 12px; color: #90A4B4;
      font-family: 'IBM Plex Mono', monospace;
    }
    #bravo-user-badge.vis { display: flex; }
    #bravo-user-name {
      max-width: 140px; overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap; color: #FFFFFF;
    }
    #bravo-signout-btn {
      font-size: 11px; font-weight: 600; letter-spacing: .08em;
      text-transform: uppercase; padding: 4px 10px; border-radius: 3px;
      border: 1px solid rgba(255,255,255,0.15); background: none;
      color: #90A4B4; cursor: pointer; font-family: inherit; transition: all .15s;
    }
    #bravo-signout-btn:hover { border-color: #F5620F; color: #F5620F; }
  `;
  document.head.appendChild(style);
}

function showLoginOverlay() {
  injectAuthStyles();
  let overlay = document.getElementById("bravo-login-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "bravo-login-overlay";
    overlay.innerHTML = `
      <div id="bravo-login-card">
        <div class="login-logo"></div>
        <h2>Bravo Logistics</h2>
        <p>Sign in with your Erthos Microsoft account to continue.</p>
        <button id="bravo-signin-btn" onclick="signIn()">
          <svg class="ms-logo" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
            <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
            <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
            <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
          </svg>
          Sign in with Microsoft
        </button>
        <div id="bravo-auth-error"></div>
      </div>`;
    document.body.appendChild(overlay);
  }
  overlay.classList.add("vis");
}

function hideLoginOverlay() {
  const overlay = document.getElementById("bravo-login-overlay");
  if (overlay) overlay.classList.remove("vis");
}

function showAuthError(msg) {
  const el = document.getElementById("bravo-auth-error");
  if (el) { el.textContent = msg; el.style.display = "block"; }
}

function updateAuthUI(user) {
  // Inject user badge into page header if it exists
  injectAuthStyles();
  const header = document.querySelector(".header");
  if (!header) return;

  let badge = document.getElementById("bravo-user-badge");
  if (!badge) {
    badge = document.createElement("div");
    badge.id = "bravo-user-badge";
    badge.innerHTML = `
      <span id="bravo-user-name"></span>
      <button id="bravo-signout-btn" onclick="signOut()">Sign out</button>`;
    // Insert before the first right-side element (fid, hdate etc.)
    const rightEl = header.querySelector(".fid, .hdate, .nav-date");
    if (rightEl) header.insertBefore(badge, rightEl);
    else header.appendChild(badge);
  }

  if (user) {
    document.getElementById("bravo-user-name").textContent = user.name;
    badge.classList.add("vis");
    // Auto-fill yard leader name field if present
    const leaderField = document.getElementById("rLeader");
    if (leaderField && !leaderField.value) leaderField.value = user.name;
  } else {
    badge.classList.remove("vis");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-inject MSAL SDK from CDN if not already loaded
// ─────────────────────────────────────────────────────────────────────────────
(function loadMSAL() {
  if (window.msal) return; // already loaded
  const script = document.createElement("script");
  script.src = "https://alcdn.msauth.net/browser/2.38.3/js/msal-browser.min.js";
  script.integrity = "sha384-w8OdMIpBwEO0JiOaO8OinJuXkGXIqsQ9R3GJMfpQD8h5C0OQBS8lNb5wSqKnS3o";
  script.crossOrigin = "anonymous";
  script.onload = () => console.log("MSAL loaded ✓");
  script.onerror = () => console.warn("MSAL CDN load failed — SSO unavailable");
  document.head.appendChild(script);
})();
