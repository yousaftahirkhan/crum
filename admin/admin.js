/* Crum super admin.
   - Content (menu, homepage, colour theme, business details, payments) is edited here and published as one commit
     to the website repository: data/shop.json plus any new photos under images/.
   - Orders are kept in orders.json in a separate private repository, so customer details never go public.
   - On this computer (localhost) it opens in a local preview: it reads the local files and never saves. */
"use strict";
const CFG = window.ADMIN_CONFIG || {};
const DEMO = ["localhost", "127.0.0.1"].includes(location.hostname);
const GH_OWNER = CFG.owner || location.hostname.split(".")[0];
const REPO = CFG.repo || "crum";
const BRANCH = CFG.branch || "main";
const ORDERS_REPO = CFG.ordersRepo || "crum-orders";
const SITE = `/repos/${GH_OWNER}/${REPO}`, ORD = `/repos/${GH_OWNER}/${ORDERS_REPO}`;
const TOKEN_KEY = "crum-admin-token";

document.querySelectorAll(".logoArt").forEach(el => el.innerHTML = logoSVG("Crum"));
$("hRepo").textContent = REPO; $("hOrders").textContent = ORDERS_REPO; $("ordersRepoName").textContent = ORDERS_REPO;
if (CFG.siteUrl) $("viewSite").href = CFG.siteUrl;

let TOKEN = "";
let S = normalizeShop({});

/* ---------- GitHub API ---------- */
class GHError extends Error { constructor(status, msg) { super(msg); this.status = status } }
/* In "app" mode (Gmail + password + authenticator sign-in) the token comes from the sign-in service and lasts 1 hour;
   it is renewed from the signed session shortly before it runs out, or once if GitHub rejects it. */
async function gh(path, opts = {}) {
  if (MODE === "app" && TOKEN_EXP - Date.now() < 5 * 60e3) await refreshAppToken();
  try { return await ghOnce(path, opts) }
  catch (e) { if (MODE === "app" && e.status === 401) { await refreshAppToken(); return ghOnce(path, opts) } throw e }
}
async function ghOnce(path, {method = "GET", body, raw, blob} = {}) {
  let r;
  try {
    r = await fetch("https://api.github.com" + path, {method, cache: "no-store",
      headers: {Authorization: "Bearer " + TOKEN, Accept: raw || blob ? "application/vnd.github.raw+json" : "application/vnd.github+json", ...(body ? {"Content-Type": "application/json"} : {})},
      body: body ? JSON.stringify(body) : undefined});
  } catch (e) { throw new GHError(0, "No internet connection. Check your connection and try again.") }
  if (!r.ok) { let m = ""; try { m = (await r.json()).message || "" } catch (e) {} throw new GHError(r.status, m) }
  if (r.status === 204) return null;
  return blob ? r.arrayBuffer() : raw ? r.text() : r.json();
}
function errText(e) {
  if (!e || e.status == null) return "Something went wrong. Please try again.";
  if (e.status === 0) return e.message;
  if (e.status === 401) return "Your sign-in has expired or is not valid. Sign out and sign in again.";
  if (e.status === 403) return /rate limit/i.test(e.message) ? "GitHub is busy. Please wait a minute and try again." : "This sign-in is not allowed to make changes. On GitHub, set the token's Contents permission to Read and write.";
  if (e.status === 404) return "The shop's repository could not be opened with this sign-in. Check the token's repository access.";
  if (e.status === 409 || e.status === 422) return "Another change was saved at the same time. Please try again.";
  return "Something went wrong (" + e.status + "). Please try again.";
}
function b64encUtf8(str) { const bytes = new TextEncoder().encode(str); let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(bin) }
function b64decUtf8(b64) { const bin = atob(String(b64).replace(/\s/g, "")); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return new TextDecoder().decode(bytes) }

/* ---------- sign in / out ----------
   Main route: Gmail + password + authenticator code, checked by the sign-in service at /api (site-proxy/lib/auth.js).
   Other routes: "Sign in with GitHub" (the service swaps GitHub's one-time code for an 8-hour token and sends it back
   here in the URL fragment), or a fine-grained access token pasted into the form. */
const EXP_KEY = "crum-admin-exp", STATE_KEY = "crum-oauth-state";
const ADMINS = (CFG.admins || [GH_OWNER]).map(s => String(s).toLowerCase());
const store = k => { try { return localStorage.getItem(k) || sessionStorage.getItem(k) || "" } catch (e) { return "" } };
const storedToken = () => { const exp = +store(EXP_KEY); if (exp && Date.now() > exp) { dropToken(); return "" } return store(TOKEN_KEY) };
const dropToken = () => { try { [TOKEN_KEY, EXP_KEY].forEach(k => { localStorage.removeItem(k); sessionStorage.removeItem(k) }) } catch (e) {} };
const keepToken = (t, remember, expiresAt) => { dropToken(); try { const s = remember ? localStorage : sessionStorage; s.setItem(TOKEN_KEY, t); if (expiresAt) s.setItem(EXP_KEY, String(expiresAt)) } catch (e) {} };
let ORDERS_OK = false;

async function signIn(t, mode = "user", who = "") {
  TOKEN = t; MODE = mode;
  if (mode === "user") {
    const me = await gh("/user");
    if (!ADMINS.includes(String(me.login).toLowerCase())) { const e = new GHError(403, "not admin"); e.notAdmin = me.login; throw e }
    who = "GitHub: " + me.login;
  }
  $("whoAmI").textContent = who ? "Signed in as " + who : "";
  ME = mode === "app" ? String(who || "").toLowerCase() : "";
  await gh(SITE);
  try { await gh(ORD); ORDERS_OK = true } catch (e) { ORDERS_OK = false }
  await loadContent();
  openApp();
}
function openApp() {
  $("booting").hidden = true; $("signin").hidden = true; $("app").hidden = false;
  const h = location.hash.slice(1); selectTab(TABS.includes(h) ? h : "orders");
  loadOrders(); loadAdmins(); poll(); renderBell();
}
const signInError = e => e && e.notAdmin ? `The GitHub account ${e.notAdmin} is not allowed to manage this shop.` : e && e.status === 401 ? "Your sign-in has expired. Please sign in again." : errText(e);
function showSignin(msg, where = "google") {
  TOKEN = ""; MODE = "user"; $("booting").hidden = true; $("app").hidden = true; $("signin").hidden = false;
  $("gMsg").textContent = where === "google" ? msg || "" : ""; $("ghMsg").textContent = where === "github" ? msg || "" : "";
  $("signMsg").textContent = where === "token" ? msg || "" : ""; $("tok").value = "";
  if (!CFG.githubAppClientId || !CFG.authUrl) $("ghSignin").hidden = true;
  if (!CFG.authUrl) { $("gSignin").hidden = true; $("otherWays").open = true }
  if (where === "github" || where === "token") $("otherWays").open = true;
}

/* ---------- Gmail + password + authenticator sign-in ---------- */
const SESSION_KEY = "crum-admin-session", SESSION_EXP_KEY = "crum-admin-session-exp";
let MODE = "user", TOKEN_EXP = 0, SESSION = "", gCred = null;
const loadSession = () => { const s = store(SESSION_KEY), x = +store(SESSION_EXP_KEY); if (s && x > Date.now()) return s; dropSession(); return "" };
const dropSession = () => { try { [SESSION_KEY, SESSION_EXP_KEY].forEach(k => { localStorage.removeItem(k); sessionStorage.removeItem(k) }) } catch (e) {} };
const keepSession = (s, exp, remember) => { dropSession(); try { const st = remember ? localStorage : sessionStorage; st.setItem(SESSION_KEY, s); st.setItem(SESSION_EXP_KEY, String(exp)) } catch (e) {} };
async function authPost(path, body) {
  let r;
  try { r = await fetch(CFG.authUrl.replace(/\/$/, "") + path, {method: "POST", cache: "no-store", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)}) }
  catch (e) { throw new GHError(0, "No internet connection. Check your connection and try again.") }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new GHError(r.status, d.error || ""); e.code = d.error; throw e }
  return d;
}
async function refreshAppToken() { const d = await authPost("/token", {session: SESSION}); TOKEN = d.token; TOKEN_EXP = d.token_exp; return d }
/* Gmail + password + authenticator code. The first sign-in of a Gmail creates its password. */
const LOGIN_ERR = {
  not_allowed: "This Gmail is not allowed to manage this shop. Ask an admin to add it under Business info → Admin access.",
  bad_code: "That code is not correct. Use the newest code from the Crum entry in your authenticator app, and check that your phone's time is set automatically.",
  bad_password: "That password is not correct. If you have forgotten it, ask another admin to reset it under Admin access.",
  weak_password: "Choose a password of at least 8 characters that is not only numbers.",
  too_many: "Too many attempts. Please wait 15 minutes and try again."
};
let NEW_PW = false;
$("otp").addEventListener("input", () => { $("otp").value = $("otp").value.replace(/\D/g, "").slice(0, 6) });
function askNewPassword(on) {
  NEW_PW = on; $("newPw").hidden = !on; $("lgPassWrap").hidden = on; $("firstHint").hidden = on;
  $("otpBtn").textContent = on ? "Create password and sign in" : "Sign in";
  if (on) { $("lgNew").value = $("lgNew2").value = ""; $("lgNew").focus() }
}
$("pwForm").addEventListener("submit", async e => {
  e.preventDefault();
  const email = $("lgEmail").value.trim().toLowerCase(), code = $("otp").value.replace(/\D/g, "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { $("gMsg").textContent = "Enter your Gmail address."; return }
  if (NEW_PW && $("lgNew").value !== $("lgNew2").value) { $("gMsg").textContent = "The two new passwords do not match."; return }
  if (code.length !== 6) { $("gMsg").textContent = "Enter the 6-digit code from your authenticator app."; return }
  $("otpBtn").disabled = true; $("otpBtn").textContent = "Checking…"; $("gMsg").textContent = "";
  try {
    const d = await authPost("/login", {email, password: $("lgPass").value, code, remember: $("trust").checked, ...(NEW_PW ? {new_password: $("lgNew").value} : {})});
    SESSION = d.session; keepSession(d.session, d.session_exp, $("trust").checked); TOKEN_EXP = d.token_exp; dropToken();
    try { localStorage.setItem("crum-admin-email", email) } catch (err) {}
    await signIn(d.token, "app", d.email);
  } catch (err) {
    if (err.code === "set_password") { askNewPassword(true); $("gMsg").textContent = ""; return }
    $("gMsg").textContent = LOGIN_ERR[err.code] || signInError(err);
    if (err.code === "bad_code") { $("otp").value = ""; $("otp").focus() }
    if (err.code === "bad_password") { $("lgPass").value = ""; $("lgPass").focus() }
  } finally { $("otpBtn").disabled = false; $("otpBtn").textContent = NEW_PW ? "Create password and sign in" : "Sign in" }
});
try { const m = localStorage.getItem("crum-admin-email"); if (m) $("lgEmail").value = m } catch (e) {}
$("ghBtn").onclick = () => {
  const state = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");
  try { sessionStorage.setItem(STATE_KEY, state) } catch (e) {}
  $("ghBtn").disabled = true; $("ghMsg").textContent = "";
  location.href = "https://github.com/login/oauth/authorize?" + new URLSearchParams({client_id: CFG.githubAppClientId, redirect_uri: CFG.authUrl.replace(/\/$/, "") + "/callback", state});
};
/* Reads the sign-in result the service put in the URL fragment, then removes it from the address bar. */
function takeAuthReturn() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (!h.has("token") && !h.has("auth_error")) return null;
  history.replaceState(null, "", location.pathname);
  let expected = ""; try { expected = sessionStorage.getItem(STATE_KEY) || ""; sessionStorage.removeItem(STATE_KEY) } catch (e) {}
  if (!expected || h.get("state") !== expected) return {error: "Sign-in could not be confirmed. Please try again."};
  const err = h.get("auth_error");
  if (err) return {error: err === "denied" ? "Sign-in was cancelled." : err === "not_allowed" ? "This GitHub account is not allowed to manage this shop." : "Sign-in did not complete. Please try again."};
  return {token: h.get("token"), expiresAt: Date.now() + (Math.max(60, +h.get("expires_in") || 28800) - 60) * 1000};
}
$("signinForm").addEventListener("submit", async e => {
  e.preventDefault();
  const t = $("tok").value.trim();
  if (!t) { $("signMsg").textContent = "Paste your access token."; return }
  $("signBtn").disabled = true; $("signBtn").textContent = "Signing in…"; $("signMsg").textContent = "";
  try { await signIn(t); keepToken(t, $("remember").checked) }
  catch (err) { TOKEN = ""; $("signMsg").textContent = err && err.status === 401 ? "This access token is not valid or has expired. Check it and try again." : signInError(err) }
  finally { $("signBtn").disabled = false; $("signBtn").textContent = "Sign in with token" }
});
$("signOut").onclick = () => {
  if (dirty && !confirm("You have unpublished changes. Sign out and discard them?")) return;
  dirty = false; dropToken(); dropSession();
  history.replaceState(null, "", location.pathname); location.reload();
};

/* ---------- tabs ---------- */
const TABS = ["orders", "menu", "home", "theme", "business", "pay"];
const PAGE = {
  orders: ["Orders", "Website orders arrive here on their own, with the customer's payment screenshot."],
  menu: ["Menu", "Desserts, sizes and prices. Changes go live when you publish."],
  home: ["Homepage", "The banner, messages and sections on the front page."],
  theme: ["Colours & fonts", "Preview the website in each colour theme and font style, and choose one of each."],
  business: ["Business info", "Shop name, delivery area, contact details and policies."],
  pay: ["Payment & delivery", "The advance, your payment accounts and delivery charges."]};
function selectTab(t) {
  document.querySelectorAll(".tab").forEach(x => x.setAttribute("aria-selected", x.dataset.tab === t));
  TABS.forEach(k => $("tab-" + k).hidden = k !== t);
  $("pageTitle").textContent = PAGE[t][0]; $("pageSub").textContent = PAGE[t][1];
  $("saveBar").hidden = t === "orders";
  if (t === "theme") startPreview();
  sidePanel(false);
  history.replaceState(null, "", "#" + t); scrollTo(0, 0);
}
document.querySelectorAll(".tab").forEach(b => b.onclick = () => selectTab(b.dataset.tab));
/* On phones the side panel slides in from the left. */
function sidePanel(open) { $("app").classList.toggle("side-open", open); $("sideScrim").hidden = !open }
$("sideOpen").onclick = () => sidePanel(true); $("sideScrim").onclick = () => sidePanel(false);
document.addEventListener("keydown", e => { if (e.key === "Escape") sidePanel(false) });

/* =====================================================================
   ORDERS (private repository: orders.json; payment screenshots in proofs/)
   Same flow and WhatsApp replies as Giftoria Atelier:
   - With an advance (orders of Rs 3,000 or more): new (payment to check) → paid (being prepared) → ready (photo sent,
     balance asked) → full (paid in full) → sent (rider on the way) → done. Fully paid upfront: new → paid → sent → done.
   - Cash on delivery (smaller orders): new (to confirm) → paid (being prepared) → sent (rider collects the cash) → done.
   ===================================================================== */
const STATUS = {new: ["Payment to check", "s-new"], accepted: ["Awaiting payment", "s-new"], paid: ["Being prepared", "s-paid"], making: ["Being prepared", "s-paid"],
  ready: ["Balance due", "s-ready"], full: ["Ready to send", "s-full"], sent: ["Out for delivery", "s-sent"], done: ["Delivered", "s-done"], cancel: ["Cancelled", "s-cancel"]};
const ACTIVE = ["new", "accepted", "paid", "making", "ready", "full", "sent"], PROG = ["paid", "making", "ready", "full"];
const FILTERS = [["open", "Active", o => ACTIVE.includes(o.status) || refundDue(o)], ["new", "To check", o => o.status === "new" || o.status === "accepted"], ["prog", "In progress", o => PROG.includes(o.status)],
  ["sent", "Out for delivery", o => o.status === "sent"], ["done", "Delivered", o => o.status === "done"], ["cancel", "Cancelled", o => o.status === "cancel"], ["all", "All", () => true]];
const PROOF_KIND = {advance: "Advance", balance: "Balance", full: "Payment"};
const SVG_PHONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>';
const SVG_WA = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3z"/></svg>';
const SVG_PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
let ORDERS = [], ordersSha = null, oFilter = "open", parsed = null, ordersBusy = false, ordersLoaded = false, renderPending = false;
const cod = o => !(o.adv > 0);                                 /* cash on delivery: nothing paid upfront */
const balanceDue = o => !cod(o) && o.rest > 0 && !o.balAt;
const paidSoFar = o => cod(o) ? 0 : o.balAt ? (o.tot || 0) : (o.adv || 0);
const refundDue = o => o.status === "cancel" && o.refund > 0 && !o.refundAt;
const statusOf = o => refundDue(o) ? ["Refund due", "s-ready"] : o.status === "new" && cod(o) ? ["To confirm", "s-new"] : STATUS[o.status] || [o.status, ""];
const cardEl = no => $("oList").querySelector(`.ocard[data-no="${CSS.escape(no)}"]`);
const telHref = p => "tel:" + String(p || "").replace(/[^\d+]/g, "");
const randId = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");

/* ---------- modals and pop-ups ---------- */
let modal = null;
function openModal(id) { closeModal(); closePops(); modal = $(id); $("scrim").hidden = false; modal.hidden = false; const c = modal.querySelector("[data-mclose]"); if (c) c.focus() }
function closeModal() { if (modal) modal.hidden = true; modal = null; $("scrim").hidden = true }
function closePops() { document.querySelectorAll(".pop").forEach(p => p.hidden = true); document.querySelectorAll("[aria-controls]").forEach(b => b.setAttribute("aria-expanded", "false")) }
$("scrim").onclick = closeModal;
document.querySelectorAll("[data-mclose]").forEach(b => b.onclick = closeModal);
document.addEventListener("keydown", e => { if (e.key === "Escape") { closeModal(); closePops() } });
$("bellBtn").onclick = e => { e.stopPropagation(); const p = $("alertPop"), open = p.hidden; closePops(); p.hidden = !open; $("bellBtn").setAttribute("aria-expanded", String(open)); if (open) renderBell() };
document.addEventListener("click", e => { if (!e.target.closest(".popwrap")) closePops() });

/* ---------- new order alerts ----------
   Orders are checked every 20 seconds (every minute while the tab is in the background). An order this device has
   not seen yet plays a two-note chime, shows a banner and puts the count in the tab title; when the page is not in
   front, a desktop notification can show too. Browsers allow sound only after the first tap on the page, so the
   bell shows a dot until then. */
const BASE_TITLE = document.title, SOUND_KEY = "crum-alert-sound", SEEN_KEY = "crum-seen-orders", POLL_MS = 20e3;
const SVG_BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>';
const AC = window.AudioContext || window.webkitAudioContext, ALERTED = new Set();
let soundOn = store(SOUND_KEY) !== "off", actx = null, SEEN = null, pollT = null;
function audio() { if (!actx && AC) { try { actx = new AC() } catch (e) { actx = null } } return actx }
const audioBlocked = () => soundOn && !!AC && (!actx || actx.state !== "running");
function unlockAudio() { if (!soundOn || (actx && actx.state === "running")) return; const a = audio(); if (a) a.resume().then(() => { renderBell(); renderAlert() }, () => {}) }
["pointerdown", "keydown", "touchend"].forEach(ev => document.addEventListener(ev, unlockAudio, {capture: true, passive: true}));
/* A soft two-note bell, played twice (about two seconds). */
function chime(force) {
  if (!soundOn && !force) return false;
  const a = audio(); if (!a || a.state !== "running") return false;
  const t0 = a.currentTime + .04, out = a.createGain(); out.gain.value = .6; out.connect(a.destination);
  [[0, 880], [.14, 1318.5], [.66, 880], [.8, 1318.5]].forEach(([d, f]) => [[1, .42, 1.1], [2, .1, .5], [3, .04, .3]].forEach(([h, v, len]) => {
    const o = a.createOscillator(), g = a.createGain(), st = t0 + d;
    o.type = "sine"; o.frequency.value = f * h;
    g.gain.setValueAtTime(.0001, st); g.gain.exponentialRampToValueAtTime(v, st + .015); g.gain.exponentialRampToValueAtTime(.0001, st + len);
    o.connect(g); g.connect(out); o.start(st); o.stop(st + len + .05);
  }));
  return true;
}
/* Phones vibrate too, once the page has been tapped (browsers block it before that). */
function buzz() { try { if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) navigator.vibrate([180, 90, 180]) } catch (e) {} }
function notifyDesktop(list) {
  if (!("Notification" in window) || Notification.permission !== "granted" || (!document.hidden && document.hasFocus())) return;
  const o = list[0], title = list.length > 1 ? `${list.length} new orders` : `New order ${o.no}`;
  const body = list.length > 1 ? list.slice(0, 4).map(x => `${x.no} · ${x.name || "Customer"} · ${rs(x.tot)}`).join("\n") : `${o.name || "Customer"} · ${rs(o.tot)}${o.needTxt ? " · needed by " + o.needTxt : ""}`;
  try { const n = new Notification(title, {body, icon: "../assets/icon-192.png", tag: "crum-new-orders"}); n.onclick = () => { window.focus(); n.close(); viewNew() } } catch (e) {}
}
function loadSeen() { try { const a = JSON.parse(localStorage.getItem(SEEN_KEY) || "null"); return Array.isArray(a) ? new Set(a) : null } catch (e) { return null } }
function saveSeen() { try { localStorage.setItem(SEEN_KEY, JSON.stringify([...SEEN].slice(-800))) } catch (e) {} }
const unseen = () => SEEN ? ORDERS.filter(o => !SEEN.has(o.no) && ACTIVE.includes(o.status)) : [];
function markSeen(nos) {
  if (!SEEN) return; let ch = false;
  nos.forEach(n => { if (n && !SEEN.has(n)) { SEEN.add(n); ch = true } });
  if (!ch) return; saveSeen(); renderAlert();
  nos.forEach(n => { const c = cardEl(n); if (c) { c.classList.remove("is-new"); const t = c.querySelector(".t-new"); if (t) t.remove() } });
}
/* Called after every load: the first time on a new device, everything already there counts as seen. */
function noticeNew() {
  if (!SEEN) { SEEN = loadSeen(); if (!SEEN) { SEEN = new Set(ORDERS.map(o => o.no)); saveSeen() } }
  const fresh = unseen().filter(o => !ALERTED.has(o.no));
  fresh.forEach(o => ALERTED.add(o.no));
  renderAlert();
  if (fresh.length) { chime(); buzz(); notifyDesktop(fresh) }
}
function renderAlert() {
  const list = unseen(), n = list.length;
  document.title = (n ? `(${n}) New order${n > 1 ? "s" : ""} · ` : "") + BASE_TITLE;
  $("newAlert").hidden = !n; if (!n) return;
  const o = list[0];
  $("newAlert").innerHTML = `<span class="na-ic">${SVG_BELL}</span>
    <div class="na-t"><b>${n > 1 ? n + " new orders" : "New order " + esc(o.no)}</b>
      <span>${n > 1 ? list.slice(0, 3).map(x => esc(x.no) + " · " + esc(x.name || "Customer")).join("<br>") + (n > 3 ? "<br>…" : "") : `${esc(o.name || "Customer")} · ${rs(o.tot)}${(o.proofs || []).length ? " · payment screenshot attached" : cod(o) ? " · cash on delivery" : ""}`}</span>
      ${audioBlocked() ? `<span class="na-snd">Tap anywhere on the page once to allow the alert sound.</span>` : ""}</div>
    <div class="na-a"><button class="btn brand" type="button" data-na="view">View order${n > 1 ? "s" : ""}</button><button class="x" type="button" data-na="hide" aria-label="Dismiss">×</button></div>`;
}
function viewNew() {
  const list = unseen(); if (!list.length) return;
  selectTab("orders"); setFilter(list.some(o => o.status === "new") ? "new" : "open");
  const first = list[0].no; markSeen(list.map(o => o.no));
  const c = cardEl(first); if (c) { c.scrollIntoView({behavior: "smooth", block: "start"}); c.classList.add("flash"); setTimeout(() => c.classList.remove("flash"), 1700) }
}
$("newAlert").addEventListener("click", e => { const b = e.target.closest("[data-na]"); if (!b) return; if (b.dataset.na === "view") viewNew(); else markSeen(unseen().map(o => o.no)) });
function renderBell() {
  const blocked = audioBlocked();
  $("bellBtn").classList.toggle("muted", !soundOn); $("bellDot").hidden = !blocked;
  $("alertSound").checked = soundOn; $("alertSoundSt").textContent = soundOn ? "Sound on" : "Sound off";
  $("soundHint").textContent = !soundOn ? "New orders will not make a sound." : !AC ? "This browser cannot play the alert sound." : blocked ? "Tap anywhere on this page once so the browser allows the sound." : "A chime plays when a new order arrives.";
  const np = "Notification" in window ? Notification.permission : "unsupported";
  $("alertNotif").hidden = np === "unsupported"; $("alertNotif").disabled = np !== "default";
  $("alertNotif").textContent = np === "granted" ? "Notifications are on" : np === "denied" ? "Notifications blocked" : "Turn on notifications";
}
$("alertSound").onchange = () => { soundOn = $("alertSound").checked; try { localStorage.setItem(SOUND_KEY, soundOn ? "on" : "off") } catch (e) {} if (soundOn) unlockAudio(); renderBell(); renderAlert() };
$("alertTest").onclick = () => { const a = audio(); if (!a) { toast("This browser cannot play sounds."); return } a.resume().then(() => { chime(true); renderBell(); renderAlert() }, () => toast("The browser blocked the sound. Tap the page and try again.")) };
$("alertNotif").onclick = async () => {
  try {
    const perm = await Notification.requestPermission();
    if (perm === "granted") { try { new Notification("Order alerts are on", {body: "A notification appears here when a new order arrives.", icon: "../assets/icon-192.png"}) } catch (e) { toast("This browser shows alerts only inside the page. The sound still works.") } }
    else toast("Notifications are blocked. You can allow them in the browser's site settings.");
  } catch (e) {}
  renderBell();
};
function setLive(on, why) {
  $("liveSt").classList.toggle("off", !on); $("liveTxt").textContent = on ? "Live" : "Offline";
  $("liveSt").title = on ? "Checked for new orders at " + new Date().toLocaleTimeString("en-GB", {hour: "2-digit", minute: "2-digit"}) + ". It checks every 20 seconds." : (why || "Orders could not be checked");
}
function poll() { clearTimeout(pollT); if (DEMO) return; pollT = setTimeout(async () => { if (TOKEN && ORDERS_OK && !ordersBusy) await loadOrders(); refreshTimes(); poll() }, document.hidden ? 60e3 : POLL_MS) }
document.addEventListener("visibilitychange", () => { if (!document.hidden && TOKEN && ORDERS_OK && !$("app").hidden) { loadOrders(); poll() } });

/* ---------- loading and saving orders ---------- */
$("oFilter").addEventListener("click", e => { const b = e.target.closest("[data-f]"); if (b) setFilter(b.dataset.f) });
document.querySelector(".kpis").addEventListener("click", e => { const k = e.target.closest("[data-kf]"); if (k) setFilter(k.dataset.kf) });
function setFilter(k) { oFilter = k; $("oSearch").value = ""; renderOrders() }
$("oSearch").addEventListener("input", () => renderOrders());
$("oRefresh").onclick = () => loadOrders(true);
$("addOrderBtn").onclick = () => { openModal("pasteModal"); setTimeout(() => $("pasteBox").focus(), 30) };

async function fetchOrders() {
  if (DEMO) return {list: ORDERS, sha: "demo"};
  try {
    const f = await gh(`${ORD}/contents/orders.json`);
    const text = f.content ? b64decUtf8(f.content) : b64decUtf8((await gh(`${ORD}/git/blobs/${f.sha}`)).content);
    const list = JSON.parse(text || "[]");
    return {list: Array.isArray(list) ? list : [], sha: f.sha};
  } catch (e) { if (e.status === 404) return {list: [], sha: null}; throw e }
}
const editingList = () => { const a = document.activeElement; return !!(a && $("oList").contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) };
$("oList").addEventListener("focusout", () => setTimeout(() => { if (renderPending && !editingList()) renderOrders() }, 0));
async function loadOrders(manual) {
  $("ordersOff").hidden = ORDERS_OK;
  if (!ORDERS_OK) { $("oList").innerHTML = `<div class="empty-box"><b>Orders are not connected</b>Orders cannot be saved until order storage is connected.</div>`; renderStats(); setLive(false, "Order storage is not connected"); return }
  if (!ordersLoaded) $("oList").innerHTML = `<div class="empty-box">Loading orders…</div>`;
  try {
    const r = await fetchOrders(); setLive(true);
    if (!ordersLoaded || r.sha !== ordersSha || DEMO) {
      ORDERS = r.list; ordersSha = r.sha; ordersLoaded = true; noticeNew();
      if (editingList()) renderPending = true; else renderOrders();
    } else refreshTimes();
    if (manual) toast("Orders are up to date");
  } catch (e) {
    setLive(false, errText(e));
    if (!ordersLoaded) $("oList").innerHTML = `<div class="empty-box"><b>Orders could not load</b>${esc(errText(e))}</div>`;
    if (manual) toast(errText(e));
  }
}
/* Applies a change to the latest orders.json and saves it; if another device saved first, reloads and retries once. */
async function mutateOrders(fn, message) {
  if (DEMO) { ORDERS = fn(ORDERS.map(o => ({...o}))); renderOrders(); return true }
  if (ordersBusy) { toast("Saving the previous change. Please wait."); return false }
  ordersBusy = true;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const next = fn(ORDERS.map(o => ({...o})));
      try {
        const r = await gh(`${ORD}/contents/orders.json`, {method: "PUT", body: {message, content: b64encUtf8(JSON.stringify(next, null, 1) + "\n"), ...(ordersSha ? {sha: ordersSha} : {})}});
        ORDERS = next; ordersSha = r.content.sha; noticeNew(); renderOrders(); return true;
      } catch (e) {
        if ((e.status === 409 || e.status === 422) && attempt === 0) { const r = await fetchOrders(); ORDERS = r.list; ordersSha = r.sha; continue }
        throw e;
      }
    }
  } catch (e) { toast(errText(e)); return false }
  finally { ordersBusy = false }
  return false;
}

/* ---------- WhatsApp replies (the same wording as Giftoria Atelier, for desserts) ---------- */
function statusText(o, status) {
  const shop = S.shop.name || "Crum", hi = o.name ? `Hello ${o.name},` : "Hello,", id = `Order ID: *${o.no}*`;
  const accts = payAccounts(S).map(a => `• ${a.k}: ${a.v}${a.who ? ` (${a.who})` : ""}`);
  const fare = o.del ? "" : " Please also keep the delivery fare ready for the rider.";
  const when = o.needTxt ? [`Delivery: ${o.needTxt}${o.area ? " · " + o.area : ""}`] : [];
  const T = {
    confirmed: [`${hi} thank you for your order! *Your order is confirmed.* ${id}`, "", ...when, `You pay *${rs(o.tot)}* in cash when it arrives.`, "", "We are preparing your order and will message you when it is on its way."],
    askpay: [`${hi} thank you for your order! ${id}`, "", `To confirm it, please send the ${o.pct >= 100 ? "payment" : `${o.pct || 50}% advance`} of *${rs(o.adv)}*${accts.length ? " to one of these accounts:" : "."}`, ...accts, "", "Then send the payment screenshot in this chat.",
      "For your safety, check the account name in your app before sending. We will never ask for your PIN or OTP."],
    paid: o.rest > 0
      ? [`${hi} we have received your advance of *${rs(o.adv)}*. Thank you!`, "", `*Your order is confirmed.* ${id}`, "", "We are preparing your order fresh. When it is ready, we will send you a photo of it here.", `The remaining *${rs(o.rest)}* is paid after you have seen the photo, before we send it with the rider.`]
      : [`${hi} we have received your payment of *${rs(o.adv || o.tot)}*. Thank you!`, "", `*Your order is confirmed and fully paid.* ${id}`, "", "We are preparing your order fresh and will message you when it is on its way."],
    ready: [`${hi} *your order is ready!* We are sending you a photo of it here.`, "", id, "", `Please pay the remaining *${rs(o.rest)}*${accts.length ? " to one of these accounts:" : "."}`, ...accts, "", "Then send the payment screenshot in this chat. We will book your rider as soon as we receive it."],
    full: [`${hi} we have received the remaining *${rs(o.rest)}*. Thank you!`, "", id, "Your order is now fully paid. We are booking your rider and will send you the details shortly."],
    sent: [`${hi} good news! *Your order is ready* and has been handed to our rider. It is on its way to you.`, "", id,
      ...(o.rider ? ["", "*Rider details*", `Name: ${o.rider.name}`, `Phone: ${o.rider.phone}`, ...(o.rider.vehicle ? [`Vehicle: ${o.rider.vehicle}`] : []), ""] : [""]),
      cod(o) ? `Please keep *${rs(o.tot)}* in cash ready for the rider.${fare}` : balanceDue(o) ? `Remaining to pay: *${rs(o.rest)}*. Please pay it to one of our accounts and send the screenshot here.` : `Your order is fully paid.${fare}`,
      "Please keep your phone nearby so the rider can reach you.", "", "*Once you receive your order, please reply here to let us know it has reached you safely.*"],
    done: [`${hi} your order has been *delivered*. Thank you for ordering from ${shop}!`, "", id, "We would love to hear what you thought. Reply here any time."],
    cancel: [`${hi} we are sorry, your order has been *cancelled*.`, "", id, ...(o.cancelReason ? [`Reason: ${o.cancelReason}`] : []), "",
      ...(o.refund > 0 ? [`*We will refund your payment of ${rs(o.refund)} within 24 hours* to the account you paid from. If you would like it sent to a different account, please reply with the details.`, ""] : []),
      "If you have any questions, please reply to this message."],
    refunded: [`${hi} we have refunded *${rs(o.refund)}* for your cancelled order. Please check your account.`, "", id, "", "We are sorry this order did not work out, and we would be glad to prepare it for you another time."]
  }[status];
  if (!T) return "";
  return [...T, "", `— ${shop}`].join("\n");
}
const statusLink = (o, st) => `https://wa.me/${intl(o.phone)}?text=${encodeURIComponent(statusText(o, st))}`;

/* ---------- order list ---------- */
function renderStats() {
  const now = new Date(), m = now.getMonth(), y = now.getFullYear(), sum = (l, k) => l.reduce((t, o) => t + (+o[k] || 0), 0);
  const chk = ORDERS.filter(o => o.status === "new" || o.status === "accepted"), prog = ORDERS.filter(o => PROG.includes(o.status)), sent = ORDERS.filter(o => o.status === "sent");
  const bal = prog.filter(balanceDue), month = ORDERS.filter(o => { const d = new Date(o.at); return o.status !== "cancel" && d.getMonth() === m && d.getFullYear() === y });
  const refunds = ORDERS.filter(refundDue), rfTxt = refunds.length ? `${refunds.length} refund${refunds.length > 1 ? "s" : ""} due` : "";
  $("kCheck").textContent = chk.length;
  $("kCheckS").textContent = chk.length ? rs(chk.reduce((t, o) => t + (cod(o) ? 0 : o.adv || 0), 0)) + " to check" + (chk.some(cod) ? " · cash orders to confirm" : "") + (rfTxt ? " · " + rfTxt : "") : rfTxt || "Everything checked";
  $("kpiCheck").classList.toggle("hot", chk.length + refunds.length > 0);
  $("kProg").textContent = prog.length; $("kProgS").textContent = bal.length ? rs(sum(bal, "rest")) + " balance due" : prog.length ? "No balance due" : "Nothing in progress";
  $("kSent").textContent = sent.length; $("kSentS").textContent = sent.length ? "With riders" : "None on the road";
  $("kMonth").textContent = rs(sum(month, "tot")); $("kMonthS").textContent = `${month.length} order${month.length === 1 ? "" : "s"} in ${now.toLocaleDateString("en-GB", {month: "long"})}`;
  $("navNew").textContent = chk.length + refunds.length; $("navNew").hidden = !(chk.length + refunds.length);
}
function renderFilters() {
  $("oFilter").innerHTML = FILTERS.map(([k, l, f]) => `<button type="button" data-f="${k}" aria-pressed="${k === oFilter}">${l}<span class="n">${ORDERS.filter(f).length}</span></button>`).join("");
}
function ago(t) {
  const sec = Math.max(0, (Date.now() - t) / 1000);
  if (sec < 60) return "Just now"; if (sec < 3600) return Math.floor(sec / 60) + " min ago"; if (sec < 86400) return Math.floor(sec / 3600) + " h ago";
  return new Date(t).toLocaleDateString("en-GB", {day: "numeric", month: "short"});
}
const fullTime = t => new Date(t).toLocaleString("en-GB", {day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true});
function refreshTimes() { $("oList").querySelectorAll("time[data-at]").forEach(el => { el.textContent = ago(+el.dataset.at) }) }
/* Needed today or tomorrow and not on its way yet. */
function isUrgent(o) {
  if (!o.need || !["new", "accepted", "paid", "making", "ready", "full"].includes(o.status)) return false;
  const d = new Date(o.need + "T00:00:00"), t = new Date(); t.setHours(0, 0, 0, 0);
  return (d - t) / 864e5 <= 1;
}
function stepsHtml(o) {
  if (o.status === "cancel") return "";
  const bal = !cod(o) && o.rest > 0, names = cod(o) ? ["Confirm", "Preparing", "On the way", "Delivered"] : bal ? ["Payment", "Preparing", "Balance", "On the way", "Delivered"] : ["Payment", "Preparing", "On the way", "Delivered"];
  const at = {new: 0, accepted: 0, paid: 1, making: 1, ready: 2, full: bal ? 3 : 2, sent: bal ? 3 : 2, done: names.length}[o.status] ?? 0;
  return `<ol class="oc-steps" aria-label="Order progress">${names.map((n, i) => `<li class="${i < at ? "done" : i === at ? "cur" : ""}">${n}</li>`).join("")}</ol>`;
}
function hintText(o) {
  switch (o.status) {
    case "new": case "accepted":
      if (cod(o)) return "Cash on delivery. Check the order, then confirm it. WhatsApp opens with the confirmation for the customer.";
      return (o.proofs || []).length ? "Check that the money has arrived in your JazzCash, Easypaisa or bank app before approving. Screenshots can be edited."
        : o.proofLater ? "The customer will send the payment screenshot on WhatsApp. Add it here when it arrives." : "No payment screenshot yet. Send your payment details, then add the screenshot here when it arrives.";
    case "paid": case "making": return cod(o) ? `When it is ready, book a rider and send the rider's details. The rider collects ${rs(o.tot)} in cash.` : balanceDue(o) ? "When it is ready, send the customer a photo in WhatsApp and ask for the balance." : "When it is ready, book a rider and send the rider's details.";
    case "ready": return `Waiting for the remaining ${rs(o.rest)}. Check it in your app before confirming.`;
    case "full": return "Paid in full. Book a rider and send the rider's details.";
    case "sent": return cod(o) ? `On the way. The rider collects ${rs(o.tot)} in cash. Mark it delivered when the customer confirms.` : "On the way. Mark it delivered when the customer confirms.";
    case "done": return o.deliveredAt ? "Delivered " + fullTime(o.deliveredAt) + "." : "Delivered.";
    case "cancel": return refundDue(o) ? `Send ${rs(o.refund)} back to the customer from your JazzCash, Easypaisa or bank app, then confirm it here.` : "";
    default: return "";
  }
}
const actBtn = (act, label, main) => main ? `<button class="btn brand md" type="button" data-act="${act}">${label}</button>` : `<button class="sm" type="button" data-act="${act}">${label}</button>`;
function actionsHtml(o) {
  const A = [];
  if (ACTIVE.includes(o.status)) A.push(`<button class="link-btn" type="button" data-act="cancel">Cancel order</button>`);
  if (o.status === "new" || o.status === "accepted") {
    if (cod(o)) A.push(actBtn("confirm", "✓ Confirm order", true));
    else { if (!(o.proofs || []).length) A.push(actBtn("askpay", "Send payment details")); A.push(actBtn("approve", `✓ Approve ${o.rest > 0 ? "advance" : "payment"}`, true)) }
  }
  else if (o.status === "paid" || o.status === "making") { if (balanceDue(o)) A.push(actBtn("balance", "Balance already paid"), actBtn("ready", "Order ready · ask for balance", true)); else A.push(actBtn("rider", "Assign rider", true)) }
  else if (o.status === "ready") A.push(actBtn("remind", "Send reminder"), actBtn("balance", "✓ Balance received", true));
  else if (o.status === "full") A.push(actBtn("rider", "Assign rider", true));
  else if (o.status === "sent") A.push(actBtn("rider", "Change rider"), actBtn("delivered", "✓ Mark delivered", true));
  else if (refundDue(o)) A.push(actBtn("refunded", "✓ Refund sent", true));
  return A.join("");
}
function payHtml(o) {
  const live = o.status !== "cancel", approved = !["new", "accepted", "cancel"].includes(o.status);
  const tag = (ok, wait) => !live ? "<span></span>" : ok ? `<i class="ok">Received</i>` : `<i class="wait">${wait}</i>`;
  const rows = [`<div class="pr tot"><span>Total</span><b>${rs(o.tot)}</b><span></span></div>`];
  if (cod(o)) rows.push(`<div class="pr"><span>Cash on delivery</span><b>${rs(o.tot)}</b>${tag(o.status === "done", "To collect")}</div>`);
  else if (o.rest > 0) rows.push(`<div class="pr"><span>Advance${o.pct ? ` (${o.pct}%)` : ""}</span><b>${rs(o.adv)}</b>${tag(approved, "To check")}</div>`,
    `<div class="pr"><span>Balance</span><b>${rs(o.rest)}</b>${tag(!!o.balAt, o.status === "ready" ? "Asked" : "Later")}</div>`);
  else rows.push(`<div class="pr"><span>Paid upfront</span><b>${rs(o.adv || o.tot)}</b>${tag(approved, "To check")}</div>`);
  if (o.refund > 0) rows.push(`<div class="pr"><span>Refund</span><b>${rs(o.refund)}</b>${o.refundAt ? `<i class="ok">Sent</i>` : `<i class="wait">Due</i>`}</div>`);
  if (cod(o)) return rows.join("");
  const pics = (o.proofs || []).map(x => { const k = PROOF_KIND[x.k] || "Payment"; return `<button type="button" class="pf" data-pview="${esc(x.p)}" title="View the ${k.toLowerCase()} screenshot"><img data-proof="${esc(x.p)}" alt="${k} screenshot"><span>${k}</span></button>` }).join("");
  const kind = o.status === "new" || o.status === "accepted" ? (o.rest > 0 ? "advance" : "full") : "balance";
  const add = (o.status === "new" || o.status === "accepted" || (["paid", "making", "ready"].includes(o.status) && balanceDue(o))) ? `<label class="pf add" title="Add a payment screenshot"><input type="file" accept="image/*" data-pfadd="${kind}" aria-label="Add the ${kind} payment screenshot">${SVG_PLUS}<span>${kind === "balance" ? "Balance" : "Add"}</span></label>` : "";
  const none = !pics && (o.status === "new" || o.status === "accepted") ? `<span class="pf-none">No screenshot yet</span>` : "";
  return rows.join("") + (pics || add ? `<div class="proofs" style="align-items:center">${pics}${add}${none}</div>` : "");
}
function orderCard(o) {
  const [lbl, cls] = statusOf(o), isNew = !!SEEN && !SEEN.has(o.no) && ACTIVE.includes(o.status), urgent = isUrgent(o), r = o.rider, act = ACTIVE.includes(o.status);
  const items = (o.items || []).map(i => `<li><span>${esc(i.name)} <span class="q">× ${i.qty}</span></span><span>${rs(i.price * i.qty)}</span></li>`).join("");
  return `<article class="ocard${isNew ? " is-new" : ""}" data-no="${esc(o.no)}" data-s="${esc(o.status)}">
  <header class="oc-h"><div class="oc-id"><b class="no">${esc(o.no)}</b>${isNew ? `<span class="tag t-new">New</span>` : ""}<span class="tag">${o.source === "website" ? "Website" : "WhatsApp"}</span>${cod(o) ? `<span class="tag">Cash</span>` : ""}${urgent ? `<span class="tag t-urgent">Urgent</span>` : ""}</div>
    <div class="oc-meta"><span class="pill ${cls}">${esc(lbl)}</span><time data-at="${+o.at || 0}" title="${esc(fullTime(o.at))}">${ago(o.at)}</time></div></header>
  ${stepsHtml(o)}
  <div class="oc-grid">
    <section class="oc-cust"><span class="lbl">Customer</span><b class="nm">${esc(o.name || "—")}</b>
      ${o.phone ? `<div class="ct"><a href="${esc(telHref(o.phone))}">${SVG_PHONE}${esc(o.phone)}</a><a class="wa" href="https://wa.me/${intl(o.phone)}" target="_blank" rel="noopener">${SVG_WA}WhatsApp</a></div>` : ""}
      ${o.addr || o.area ? `<div class="addr">${esc([o.area, o.addr].filter(Boolean).join(" · "))}</div>` : ""}
      ${o.needTxt ? `<div class="need${urgent ? " urgent" : ""}">Needed by <b>${esc(o.needTxt)}</b></div>` : ""}</section>
    <section class="oc-items"><span class="lbl">Items</span>${items ? `<ul>${items}</ul>` : `<span class="sub">No items listed</span>`}
      ${o.note ? `<p class="note">Note: ${esc(o.note)}</p>` : ""}</section>
    <section class="oc-pay"><span class="lbl">Payment</span>${payHtml(o)}</section>
  </div>
  ${r ? `<div class="oc-note rider-info">Rider <b>${esc(r.name)}</b> · <a href="${esc(telHref(r.phone))}">${esc(r.phone)}</a>${r.vehicle ? " · " + esc(r.vehicle) : ""}</div>` : ""}
  ${o.status === "cancel" ? `<div class="oc-note cancel-info">Cancelled${o.cancelReason ? ": " + esc(o.cancelReason) : ""}${o.refund > 0 ? (o.refundAt ? ` · ${rs(o.refund)} refunded on ${esc(fullTime(o.refundAt))}` : ` · refund of ${rs(o.refund)} to send`) : ""}</div>` : ""}
  ${act || o.status === "done" || refundDue(o) ? `<footer class="oc-f"><span class="oc-hint">${esc(hintText(o))}</span><div class="oc-acts">${actionsHtml(o)}</div></footer>` : ""}
  ${act ? `<div class="oc-form" data-form="rider" hidden>
    <div class="three">
      <label class="fld">Rider name<input data-rf="name" maxlength="40" value="${esc(r ? r.name : "")}" placeholder="Ali Raza" autocomplete="off"></label>
      <label class="fld">Rider phone<input data-rf="phone" inputmode="tel" maxlength="20" value="${esc(r ? r.phone : "")}" placeholder="0300 1234567" autocomplete="off"></label>
      <label class="fld">Vehicle (optional)<input data-rf="vehicle" maxlength="40" value="${esc(r ? r.vehicle : "")}" placeholder="Bike · LEB-1234" autocomplete="off"></label>
    </div>
    <div class="oc-fa"><button class="btn brand md" type="button" data-act="rsave">Save and send on WhatsApp</button><button class="sm" type="button" data-act="close">Close</button></div>
  </div>
  <div class="oc-form cancel" data-form="cancel" hidden>
    <label class="fld">Reason for cancelling (sent to the customer)<input data-creason maxlength="160" placeholder="e.g. We cannot deliver on your date" autocomplete="off"></label>
    ${paidSoFar(o) > 0 || (o.proofs || []).length ? `<label class="toggle"><input type="checkbox" data-crefund${o.status !== "new" || (o.proofs || []).length ? " checked" : ""}> Refund the ${rs(paidSoFar(o))} they paid</label>
    <p class="hint">Untick this if the money never reached your account, for example when a screenshot turns out to be fake.</p>` : ""}
    <div class="oc-fa"><button class="btn md danger" type="button" data-act="cancelgo">Cancel order and tell the customer</button><button class="sm" type="button" data-act="close">Keep order</button></div>
  </div>` : ""}
</article>`;
}
function emptyHtml(q) {
  if (q) return `<div class="empty-box"><b>No order found</b>Nothing matches “${esc(q)}”. If the customer ordered on WhatsApp only, use Add order.</div>`;
  if (!ORDERS.length) return `<div class="empty-box"><b>No orders yet</b>Orders placed on the website appear here on their own, with an alert sound.</div>`;
  return `<div class="empty-box"><b>Nothing here</b>No orders with this status.</div>`;
}
/* Re-draws the list; any rider or cancel form that is open keeps what was typed in it. */
function renderOrders() {
  renderPending = false;
  const keep = {};
  $("oList").querySelectorAll(".ocard").forEach(c => { const f = [...c.querySelectorAll("[data-form]")].find(x => !x.hidden); if (f) keep[c.dataset.no] = [f.dataset.form, [...f.querySelectorAll("input")].map(i => i.type === "checkbox" ? i.checked : i.value)] });
  renderStats(); renderFilters();
  ORDERS.sort((a, b) => (b.at || 0) - (a.at || 0));
  const q = $("oSearch").value.trim().toLowerCase(), qd = q.replace(/\D/g, ""), f = (FILTERS.find(x => x[0] === oFilter) || FILTERS[0])[2];
  const list = (q ? ORDERS : ORDERS.filter(f)).filter(o => !q || [o.no, o.name, o.phone, o.area, o.city].join(" ").toLowerCase().includes(q) || (qd.length >= 4 && String(o.phone).replace(/\D/g, "").includes(qd)));
  $("oList").innerHTML = list.length ? list.map(orderCard).join("") : emptyHtml(q);
  for (const [no, [form, vals]] of Object.entries(keep)) {
    const c = cardEl(no), el = c && c.querySelector(`[data-form="${form}"]`); if (!el) continue;
    el.hidden = false; el.querySelectorAll("input").forEach((i, n) => { if (vals[n] == null) return; if (i.type === "checkbox") i.checked = vals[n]; else i.value = vals[n] });
  }
  wireThumbs();
}
$("oList").addEventListener("click", e => {
  const card = e.target.closest(".ocard"); if (!card) return;
  const o = ORDERS.find(x => x.no === card.dataset.no); if (!o) return;
  markSeen([o.no]);
  const pv = e.target.closest("[data-pview]"); if (pv) { openProof(o, pv.dataset.pview); return }
  const b = e.target.closest("[data-act]"); if (b) doAct(b.dataset.act, o, b, card);
});
function doAct(act, o, b, card) {
  const no = o.no, form = k => card && card.querySelector(`[data-form="${k}"]`);
  if (act === "rider" || act === "cancel") {
    const f = form(act); if (!f) return; const show = f.hidden;
    card.querySelectorAll("[data-form]").forEach(x => x.hidden = true); f.hidden = !show;
    if (show) { f.querySelector("input").focus({preventScroll: true}); f.scrollIntoView({block: "nearest", behavior: "smooth"}) }
    return;
  }
  if (act === "close") { b.closest("[data-form]").hidden = true; return }
  if (act === "remind") { window.open(statusLink(o, "ready"), "_blank", "noopener"); return }
  if (act === "askpay") { window.open(statusLink(o, "askpay"), "_blank", "noopener"); toast("Send the payment details in WhatsApp. Add the screenshot here when it arrives."); return }
  if (act === "confirm") return step(b, o, {status: "paid", approvedAt: Date.now()}, "confirmed", `Order ${no}: confirmed (cash on delivery)`, "Order confirmed. Send the confirmation in WhatsApp.");
  if (act === "approve") return step(b, o, {status: "paid", approvedAt: Date.now()}, "paid", `Order ${no}: ${o.rest > 0 ? "advance" : "payment"} approved`, `${o.rest > 0 ? "Advance" : "Payment"} approved. Send the confirmation in WhatsApp.`);
  if (act === "ready") return step(b, o, {status: "ready", readyAt: Date.now()}, "ready", `Order ${no}: ready, balance requested`, "Now send the photo of the ready order in the same WhatsApp chat.");
  if (act === "balance") return step(b, o, {status: "full", balAt: Date.now()}, "full", `Order ${no}: balance received`, "Balance received. Book the rider next.");
  if (act === "delivered") return step(b, o, {status: "done", deliveredAt: Date.now()}, null, `Order ${no}: delivered`, "Marked as delivered.");
  if (act === "rsave") {
    const f = form("rider"), val = k => f.querySelector(`[data-rf="${k}"]`).value.trim(), rider = {name: val("name"), phone: val("phone"), vehicle: val("vehicle")};
    if (!rider.name || rider.phone.replace(/\D/g, "").length < 10) { toast("Enter the rider's name and a valid phone number."); return }
    return step(b, o, {rider, status: "sent", sentAt: Date.now()}, "sent", `Order ${no}: rider ${rider.name}, out for delivery`, "Rider saved. Send the details to the customer in WhatsApp.");
  }
  if (act === "cancelgo") {
    const f = form("cancel"), reason = f.querySelector("[data-creason]").value.trim(), rf = f.querySelector("[data-crefund]");
    if (!reason) { toast("Please write the reason for cancelling."); return }
    const refund = rf && rf.checked ? (paidSoFar(o) || o.adv || 0) : 0;
    return step(b, o, {status: "cancel", prevStatus: o.status, cancelReason: reason, cancelledAt: Date.now(), refund}, "cancel", `Order ${no}: cancelled (${reason})${refund ? ", refund " + rs(refund) + " due" : ""}`,
      refund ? "Order cancelled. Send the message in WhatsApp, then refund the money and tap Refund sent." : "Order cancelled. Send the message to the customer in WhatsApp.");
  }
  if (act === "refunded") return step(b, o, {refundAt: Date.now()}, "refunded", `Order ${no}: refund of ${rs(o.refund)} sent`, "Refund recorded. Send the confirmation in WhatsApp.");
}
/* Saves a status change, then opens the customer's WhatsApp chat with the matching message. The tab is opened
   straight away, inside the click, so the browser does not block it. */
async function step(b, o, patch, msgKey, commitMsg, done) {
  const win = msgKey && o.phone ? window.open("", "_blank") : null; if (b) b.disabled = true;
  if (await mutateOrders(list => list.map(x => x.no === o.no ? {...x, ...patch} : x), commitMsg)) {
    const ord = ORDERS.find(x => x.no === o.no);
    if (win && ord) win.location.href = statusLink(ord, msgKey);
    toast(done);
  } else { if (b) b.disabled = false; if (win) win.close() }
}

/* ---------- payment screenshots (private repository, proofs/) ---------- */
const PROOF_URL = new Map();
function proofUrl(path) {
  if (DEMO && !PROOF_URL.has(path)) PROOF_URL.set(path, Promise.resolve("../images/share.jpg"));
  if (!PROOF_URL.has(path)) PROOF_URL.set(path, gh(`${ORD}/contents/${path.split("/").map(encodeURIComponent).join("/")}`, {blob: true})
    .then(buf => URL.createObjectURL(new Blob([buf], {type: /\.png$/i.test(path) ? "image/png" : "image/jpeg"})))
    .catch(e => { PROOF_URL.delete(path); throw e }));
  return PROOF_URL.get(path);
}
const thumbIO = "IntersectionObserver" in window ? new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { thumbIO.unobserve(en.target); loadThumb(en.target) } }), {rootMargin: "300px"}) : null;
function loadThumb(img) { proofUrl(img.dataset.proof).then(u => { img.src = u }).catch(() => { const b = img.closest(".pf"); if (b) b.classList.add("broken") }) }
function wireThumbs() { if (thumbIO) thumbIO.disconnect(); $("oList").querySelectorAll("img[data-proof]").forEach(img => thumbIO ? thumbIO.observe(img) : loadThumb(img)) }
function openProof(o, path) {
  const x = (o.proofs || []).find(y => y.p === path) || {}, kind = PROOF_KIND[x.k] || "Payment";
  $("lbTitle").textContent = kind + " screenshot";
  $("lbSub").textContent = `${o.no} · ${o.name || "Customer"} · ${x.k === "balance" ? "balance " + rs(o.rest) : o.rest > 0 ? "advance " + rs(o.adv) : rs(o.adv || o.tot)}`;
  const img = $("lbImg"); img.removeAttribute("src"); img.alt = "Loading the screenshot…";
  const can = o.status === "new" || o.status === "accepted" ? ["approve", `✓ Approve ${o.rest > 0 ? "advance" : "payment"}`] : o.status === "ready" && x.k === "balance" ? ["balance", "✓ Balance received"] : null;
  $("lbFoot").innerHTML = can ? `<p class="hint">Before you approve, check that this payment has arrived in your JazzCash, Easypaisa or bank app. A screenshot on its own is not proof.</p><button class="btn brand md" type="button" data-lbact="${can[0]}" data-no="${esc(o.no)}">${can[1]}</button>` : "";
  openModal("lightbox");
  proofUrl(path).then(u => { if (!$("lightbox").hidden) { img.src = u; img.alt = kind + " screenshot" } }).catch(e => { img.alt = "The screenshot could not load. " + errText(e) });
}
$("lbFoot").addEventListener("click", e => { const b = e.target.closest("[data-lbact]"); if (!b) return; const o = ORDERS.find(x => x.no === b.dataset.no); if (!o) return; doAct(b.dataset.lbact, o, b, cardEl(o.no)); closeModal() });
/* The owner can add a screenshot the customer sent on WhatsApp (an order taken on WhatsApp, or the balance). */
$("oList").addEventListener("change", async e => {
  const inp = e.target.closest("[data-pfadd]"); if (!inp || !inp.files[0]) return;
  const no = inp.closest(".ocard").dataset.no, kind = inp.dataset.pfadd, file = inp.files[0]; inp.value = "";
  if (ordersBusy) { toast("Saving the previous change. Please wait."); return }
  toast("Uploading the screenshot…");
  try {
    const blob = await toJpeg(file, 1600, .82), path = `proofs/${no}-${kind[0]}${randId(5)}.jpg`;
    if (!DEMO) await gh(`${ORD}/contents/${path}`, {method: "PUT", body: {message: `Order ${no}: ${kind} payment screenshot`, content: await blobB64(blob)}});
    PROOF_URL.set(path, Promise.resolve(URL.createObjectURL(blob)));
    if (await mutateOrders(list => list.map(o => o.no === no ? {...o, proofs: [...(o.proofs || []), {p: path, k: kind, at: Date.now()}], proofLater: false} : o), `Order ${no}: ${kind} screenshot added`)) toast("Screenshot added");
  } catch (err) { toast(err && err.status != null ? errText(err) : "Could not use this file. Please choose a JPG or PNG screenshot.") }
});

/* ---------- orders that came only on WhatsApp ---------- */
/* Reads a WhatsApp order message (the format the storefront sends) back into fields. */
function parseOrder(raw) {
  const t = raw.replace(/\*/g, "").replace(/\r/g, "");
  const g = re => { const m = t.match(re); return m ? m[1].trim() : "" };
  const items = []; t.split("\n").forEach(l => { const m = l.match(/^\s*[•\-]\s*(.+?)\s+[x×]\s*(\d+)\s*(?:=|—|–|-)\s*Rs\.?\s*([\d,]+)/i); if (m) { const q = +m[2]; items.push({name: m[1].trim(), qty: q, price: Math.round(num(m[3]) / q)}) } });
  const o = {no: g(/Order ID\s*[—–\-:#*]*\s*\*?([A-Z]{1,4}-\d{6}-[0-9A-Z]{4})/i).toUpperCase(), items,
    del: num(g(/(?:^|\n)\s*Delivery:\s*Rs\.?\s*([\d,]+)/i)), tot: num(g(/(?:^|\n)\s*Total:\s*Rs\.?\s*([\d,]+)/i)), adv: num(g(/(?:Advance[^:\n]*|Paid in full|Full payment[^:\n]*):\s*Rs\.?\s*([\d,]+)/i)),
    pct: num(g(/Advance[^(\n]*\((\d{1,3})%\)/i)),
    name: g(/Name:\s*(.+)/i), phone: g(/Phone:\s*(.+)/i), city: g(/City:\s*(.+)/i), addr: g(/Address:\s*(.+)/i), area: g(/Area:\s*(.+)/i),
    needTxt: g(/Needed by:\s*(.+)/i), need: (() => { const m = g(/Needed by:\s*(\d{1,2} \w{3} \d{4})/i); const d = m ? new Date(m) : null; return d && !isNaN(d) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "" })(), note: g(/Note:\s*(.+)/i)};
  if (!o.tot && items.length) o.tot = items.reduce((sum, i) => sum + i.price * i.qty, 0) + o.del;
  if (!o.no) o.no = makeOrderNo(S.shop.name);
  o.rest = Math.max(0, o.tot - o.adv);
  if (!o.pct && o.adv) o.pct = o.rest ? Math.round(o.adv / o.tot * 100) : 100;
  return (o.name || o.phone || items.length) ? o : null;
}
$("pasteRead").onclick = () => {
  parsed = parseOrder($("pasteBox").value);
  if (!parsed) { $("pastePreview").innerHTML = `<p class="msg err" style="text-align:left">No order was found in this message. Paste the customer's full order message.</p>`; $("pasteSave").disabled = true; return }
  const dup = ORDERS.some(o => o.no === parsed.no);
  $("pastePreview").innerHTML = `<div class="preview"><b>${esc(parsed.no)}</b> · ${esc(parsed.name)} · ${esc(parsed.phone)}<br>${parsed.items.map(i => esc(i.name) + " × " + i.qty).join(", ") || "No items found"}<br>Total ${rs(parsed.tot)}${parsed.adv ? ` · advance ${rs(parsed.adv)}` : " · cash on delivery"}${dup ? `<br><b style="color:var(--bad)">This order is already saved. Saving again will replace it.</b>` : ""}</div>`;
  $("pasteSave").disabled = !ORDERS_OK;
};
$("pasteSave").onclick = async () => {
  if (!parsed || !ORDERS_OK) return; $("pasteSave").disabled = true;
  const o = {...parsed, status: "new", at: Date.now(), source: "whatsapp", proofs: [], proofLater: !!parsed.adv};
  if (await mutateOrders(list => [o, ...list.filter(x => x.no !== o.no)], `Add order ${o.no}`)) {
    $("pasteBox").value = ""; $("pastePreview").innerHTML = ""; parsed = null; closeModal(); toast("Order " + o.no + " saved");
  } else $("pasteSave").disabled = false;
};

/* =====================================================================
   CONTENT (website repository: data/shop.json + images/)
   ===================================================================== */
let baseSha = null, loadedImgs = new Set(), dirty = false, saving = false, editVer = 0, editing = null, editId = null, pending = null, LIVE_THEME = "";
let SZ = []; /* sizes being edited in the dessert editor */
const M = $("manager");
const getPath = (o, p) => p.split(".").reduce((a, k) => a == null ? a : a[k], o);
function setPath(o, p, v) { const ks = p.split("."); let a = o; for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null) a[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {}; a = a[ks[i]] } a[ks[ks.length - 1]] = v }
function imgPaths(D) {
  const out = new Set(), add = v => { if (typeof v === "string" && v.startsWith("images/")) out.add(v) };
  D.products.forEach(p => { add(p.photo); p.sizes.forEach(s => add(s.photo)) }); D.slides.forEach(s => add(s && s.photo)); add(D.promo.photo); add(D.about.photo);
  return out;
}
async function loadContent() {
  if (DEMO) {
    S = normalizeShop(await (await fetch("../data/shop.json?v=" + Date.now(), {cache: "no-store"})).json()); baseSha = "demo";
  } else {
    const sha = (await gh(`${SITE}/git/ref/heads/${BRANCH}`)).object.sha;
    S = normalizeShop(JSON.parse(await gh(`${SITE}/contents/data/shop.json?ref=${sha}`, {raw: true}))); baseSha = sha;
  }
  loadedImgs = imgPaths(S); LIVE_THEME = S.theme || DEFAULT_THEME; LIVE_FONTS = S.fonts || DEFAULT_FONTS;
  $("pEditor").hidden = true; editing = null; pending = null;
  setClean(); fillBinds(); renderList(); renderThemes(); renderFonts();
}

function markDirty() { editVer++; dirty = true; $("saveSt").textContent = "Unpublished changes"; $("saveSt").className = "st dirty"; $("saveAll").disabled = false; $("discardAll").hidden = false }
function setClean(msg) { dirty = false; $("saveSt").textContent = msg || "All changes published"; $("saveSt").className = "st"; $("saveAll").disabled = true; $("discardAll").hidden = true }
window.addEventListener("beforeunload", e => { if (dirty && !DEMO) { e.preventDefault(); e.returnValue = "" } });

$("saveAll").onclick = async () => {
  if (saving) return;
  if (DEMO) { toast("Local preview: publishing is turned off here."); return }
  saving = true; const ver = editVer;
  $("saveAll").disabled = true; $("discardAll").disabled = true; $("saveSt").textContent = "Publishing…"; $("saveSt").className = "st";
  try {
    const head = (await gh(`${SITE}/git/ref/heads/${BRANCH}`)).object.sha;
    if (head !== baseSha) {
      const cmp = await gh(`${SITE}/compare/${baseSha}...${head}`);
      if ((cmp.files || []).some(f => f.filename === "data/shop.json")) { const err = new Error("conflict"); err.conflict = true; throw err }
    }
    const commit = await gh(`${SITE}/git/commits/${head}`);
    const used = imgPaths(S), tree = [];
    for (const path of used) {
      if (loadedImgs.has(path) || !PENDING_PHOTOS.has(path)) continue;
      const blob = await gh(`${SITE}/git/blobs`, {method: "POST", body: {content: PENDING_PHOTOS.get(path).split(",")[1], encoding: "base64"}});
      tree.push({path, mode: "100644", type: "blob", sha: blob.sha});
    }
    for (const path of loadedImgs) if (!used.has(path)) tree.push({path, mode: "100644", type: "blob", sha: null});
    tree.push({path: "data/shop.json", mode: "100644", type: "blob", content: JSON.stringify(S, null, 1) + "\n"});
    const t = await gh(`${SITE}/git/trees`, {method: "POST", body: {base_tree: commit.tree.sha, tree}});
    const c = await gh(`${SITE}/git/commits`, {method: "POST", body: {message: "Update shop content", tree: t.sha, parents: [head]}});
    await gh(`${SITE}/git/refs/heads/${BRANCH}`, {method: "PATCH", body: {sha: c.sha}});
    baseSha = c.sha; loadedImgs = used; LIVE_THEME = S.theme; LIVE_FONTS = S.fonts; renderThemes(); renderFonts();
    if (editVer === ver) setClean("Published. The website updates in about a minute."); else markDirty();
    toast("Published");
  } catch (e) {
    $("saveAll").disabled = false; $("saveSt").className = "st dirty";
    $("saveSt").textContent = e.conflict ? "The website was changed from another device. Select Discard to load the latest version, then make your changes again." : "Not published. " + errText(e);
  } finally { saving = false; $("discardAll").disabled = false }
};
$("discardAll").onclick = async () => {
  if (!confirm("Discard all unpublished changes and load the live version?")) return;
  try { await loadContent(); toast("Changes discarded") } catch (e) { toast(errText(e)) }
};

/* photos: resized in the browser, kept as pending until the next publish */
async function shrink(file, max) {
  try { const bmp = await createImageBitmap(file); const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(b => r(b || file), "image/jpeg", .85)) } catch (e) { return file }
}
const toDataURL = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b) });
async function storePhoto(file, max, name) {
  const blob = await shrink(file, max);
  const ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}[blob.type];
  if (!ext) throw new Error("type");
  const path = `images/${name}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}.${ext}`;
  PENDING_PHOTOS.set(path, await toDataURL(blob));
  return path;
}
const PHOTO_ERR = "Could not use this photo. Please choose a JPG or PNG photo.";
const slug = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);

/* "Button opens" choices: the full menu, one dessert, or one size. */
function goOptions() {
  const sizes = []; S.products.forEach(p => p.sizes.forEach(s => { if (s.id && s.name && !sizes.some(x => x.id === s.id)) sizes.push(s) }));
  return [["all", "Full menu"], ...S.products.map(p => [p.id, p.name]), ...sizes.map(s => ["size:" + s.id, "All " + s.name + " items"])];
}
function fillGoSelects() { M.querySelectorAll("[data-goes]").forEach(sel => { const v = getPath(S, sel.dataset.b) || "all"; sel.innerHTML = goOptions().map(([k, l]) => `<option value="${esc(k)}"${k === v ? " selected" : ""}>${esc(l)}</option>`).join("") }) }

function warns() {
  $("payWarn").hidden = !advSetting(S) || payAccounts(S).length > 0;
  $("paySummary").textContent = "Customers see: " + paymentSummary(S);
  $("waWarn").hidden = intl(S.shop.wa).length >= 11;
}
$("areasBox").addEventListener("input", () => { S.shop.areas = [...new Set($("areasBox").value.split("\n").map(a => a.trim()).filter(Boolean))]; changed() });
function fillBinds() {
  $("areasBox").value = (S.shop.areas || []).join("\n");
  renderAnnEd(); renderSlideEd(); renderWhyEd(); fillGoSelects();
  M.querySelectorAll("[data-b]").forEach(el => { const v = getPath(S, el.dataset.b); if (el.type === "checkbox") el.checked = !!v; else if (!el.hasAttribute("data-goes")) el.value = v == null ? "" : v });
  fillThumbs(); renderLists(); warns();
}
function fillThumbs() { M.querySelectorAll("[data-thumb]").forEach(el => { const v = getPath(S, el.dataset.thumb); el.innerHTML = v ? `<img src="${esc(photoSrc(v))}" alt="">` : "None" }) }
function changed() { warns(); markDirty() }
M.addEventListener("input", e => {
  const el = e.target;
  if (el.closest("#pEditor")) return;
  if (el.dataset.b) { const v = el.type === "checkbox" ? el.checked : el.hasAttribute("data-n") ? Math.max(0, +el.value || 0) : el.value; setPath(S, el.dataset.b, v); changed(); return }
  if (el.dataset.ann != null) { const a = []; M.querySelectorAll("[data-ann]").forEach(x => a.push(x.value)); S.shop.announce = a.map(x => x.trim()).filter(Boolean); changed(); return }
  if (el.dataset.qp) { const [pi, si] = el.dataset.qp.split("|").map(Number), s = S.products[pi] && S.products[pi].sizes[si]; if (!s) return; s.price = Math.max(0, Math.round(+el.value || 0)); if (s.was && s.was <= s.price) s.was = 0; changed(); return }
  if (el.dataset.li) { const [path, i, k, kind] = el.dataset.li.split("|");
    if (kind === "b") { getPath(S, path)[+i][k] = el.checked; const row = el.closest(".lrow"); row.classList.toggle("off", !el.checked); row.querySelector(".switch .st").textContent = el.checked ? "Active" : "Inactive" }
    else getPath(S, path)[+i][k] = kind === "1" ? Math.max(0, +el.value || 0) : el.value;
    changed() }
});
M.addEventListener("change", async e => {
  const el = e.target;
  if (el.closest("#pEditor")) return;
  if (el.dataset.qo) { const [pi, si] = el.dataset.qo.split("|").map(Number), s = S.products[pi].sizes[si]; s.soldOut = !el.checked; renderList(); changed(); return }
  if (el.dataset.ph && el.files[0]) { toast("Preparing photo…");
    try { setPath(S, el.dataset.ph, await storePhoto(el.files[0], 1400, "site/" + el.dataset.ph.replace(/\./g, "-"))); fillThumbs(); changed(); toast("Photo added. Publish to make it live.") } catch (err) { toast(PHOTO_ERR) } el.value = "" }
});
M.addEventListener("click", e => {
  if (e.target.closest("#pEditor")) return;
  const rm = e.target.closest("[data-phrm]"), la = e.target.closest("[data-ladd]"), ld = e.target.closest("[data-ldel]");
  if (rm) { setPath(S, rm.dataset.phrm, ""); fillThumbs(); changed() }
  if (la) { let arr = getPath(S, la.dataset.ladd); if (!arr) { setPath(S, la.dataset.ladd, []); arr = getPath(S, la.dataset.ladd) } arr.push(la.dataset.ladd === "pay.accounts" ? {method: "JazzCash", title: "", number: "", active: true} : {}); renderLists(); changed() }
  if (ld) { const [path, i] = ld.dataset.ldel.split("|"); getPath(S, path).splice(+i, 1); renderLists(); changed() }
});

function renderAnnEd() {
  const a = (S.shop.announce || []).slice(0, 4); while (a.length < 4) a.push("");
  $("annEd").innerHTML = a.map((x, i) => `<label class="fld" for="an${i}">Message ${i + 1}<input id="an${i}" data-ann="${i}" maxlength="90" value="${esc(x)}"></label>`).join("");
}
function renderSlideEd() {
  while (S.slides.length < 3) S.slides.push({});
  $("slideEd").innerHTML = S.slides.slice(0, 3).map((s, i) => `<div style="display:flex;flex-direction:column;gap:8px;${i ? "border-top:1px solid var(--line);padding-top:14px" : ""}">
    <b>Slide ${i + 1}</b>
    <div class="two"><label class="fld" for="sl${i}k">Small label<input id="sl${i}k" data-b="slides.${i}.kicker" maxlength="40"></label><label class="fld" for="sl${i}t">Heading<input id="sl${i}t" data-b="slides.${i}.title" maxlength="70"></label></div>
    <label class="fld" for="sl${i}x">Text<input id="sl${i}x" data-b="slides.${i}.text" maxlength="140"></label>
    <div class="two"><label class="fld" for="sl${i}b">Button<input id="sl${i}b" data-b="slides.${i}.btn" maxlength="24"></label>
      <label class="fld" for="sl${i}g">Button opens<select id="sl${i}g" data-b="slides.${i}.go" data-goes></select></label></div>
    <div class="phrow"><span class="thumb" data-thumb="slides.${i}.photo"></span><label class="sm">Change photo<input type="file" accept="image/*" data-ph="slides.${i}.photo"></label><button class="sm red" type="button" data-phrm="slides.${i}.photo">Remove</button></div>
  </div>`).join("");
}
function renderWhyEd() {
  while (S.why.length < 3) S.why.push({});
  $("whyEd").innerHTML = S.why.slice(0, 3).map((w, i) => `<div class="two"><label class="fld" for="wy${i}t">Point ${i + 1}<input id="wy${i}t" data-b="why.${i}.t" maxlength="40"></label><label class="fld" for="wy${i}x">Text<input id="wy${i}x" data-b="why.${i}.x" maxlength="120"></label></div>`).join("");
}
const LISTS = {reviews: [["name", "Name"], ["city", "City"], ["text", "Review"]],
  "pay.accounts": [["method", "Payment method", "s"], ["title", "Account title"], ["number", "Account number / IBAN"], ["active", "Status", "b"]]};
function renderLists() {
  M.querySelectorAll("[data-list]").forEach(box => { const path = box.dataset.list, arr = getPath(S, path) || [], fs = LISTS[path];
    box.innerHTML = arr.length ? arr.map((it, i) => `<div class="lrow${fs.some(f => f[2] === "b") && it.active === false ? " off" : ""}" style="--n:${fs.length}">${fs.map(([k, l, t]) => { const id = `li_${path.replace(/\./g, "_")}_${i}_${k}`, li = `${path}|${i}|${k}|${t === "n" ? 1 : t === "b" ? "b" : ""}`;
      if (t === "b") { const on = it[k] !== false; return `<div class="fld">${l}<label class="switch" for="${id}"><input type="checkbox" id="${id}" data-li="${li}"${on ? " checked" : ""}><span class="knob" aria-hidden="true"></span><span class="st">${on ? "Active" : "Inactive"}</span></label></div>` }
      return `<label class="fld" for="${id}">${l}${t === "s" ? `<select id="${id}" data-li="${li}">${PAY_METHODS.map(m => `<option${m === it[k] ? " selected" : ""}>${esc(m)}</option>`).join("")}</select>` : `<input id="${id}" ${t === "n" ? 'type="number" min="0" step="10"' : ""} data-li="${li}" value="${esc(it[k] ?? "")}">`}</label>` }).join("")}<button class="sm red" type="button" data-ldel="${path}|${i}" aria-label="Remove">×</button></div>`).join("")
      : `<p class="hint">Nothing added yet.</p>` });
}

/* ---------- menu: desserts and their sizes ---------- */
function renderList() {
  $("pCount").textContent = S.products.length;
  $("pList").innerHTML = S.products.length ? S.products.map((p, i) => { const ph = p.photo || sizePhoto(p, p.sizes[0]);
    return `<div class="prow"><div class="mini">${ph ? `<img src="${esc(photoSrc(ph))}" alt="">` : ""}</div>
    <div style="min-width:0"><div class="nm">${esc(p.name)}${p.soldOut ? ` <span class="src urgent">Sold out</span>` : ""}${p.best ? ` <span class="src">Bestseller</span>` : ""}${p.isNew ? ` <span class="src">New</span>` : ""}</div>
      <div class="qsz">${p.sizes.map((s, si) => `<div class="qrow${s.soldOut ? " off" : ""}"><span>${esc(s.name || "Unnamed size")}${s.serves ? ` <span class="sub">· ${esc(s.serves)}</span>` : ""}</span>
        <input type="number" min="0" step="10" inputmode="numeric" data-qp="${i}|${si}" value="${s.price || 0}" aria-label="Price of ${esc(p.name)}, ${esc(s.name)} (Rs)">
        <label class="switch" for="qo${i}_${si}"><input type="checkbox" id="qo${i}_${si}" data-qo="${i}|${si}"${s.soldOut ? "" : " checked"}><span class="knob" aria-hidden="true"></span><span class="st">${s.soldOut ? "Sold out" : "Available"}</span></label></div>`).join("") || `<span class="hint">No sizes yet. Select Edit to add them.</span>`}</div></div>
    <div class="acts"><button class="sm" type="button" data-up="${i}" ${i === 0 ? "disabled" : ""} aria-label="Move up">↑</button><button class="sm" type="button" data-ed="${i}">Edit</button><button class="sm red" type="button" data-del="${i}">Delete</button></div></div>` }).join("")
    : `<p class="hint">No desserts yet. Select "+ New dessert".</p>`;
}
$("pList").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.ed != null) openEditor(+b.dataset.ed);
  else if (b.dataset.up != null) { const i = +b.dataset.up; [S.products[i - 1], S.products[i]] = [S.products[i], S.products[i - 1]]; afterP() }
  else if (b.dataset.del != null) { if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "Confirm delete?"; return }
    S.products.splice(+b.dataset.del, 1); $("pEditor").hidden = true; editing = null; afterP(); toast("Dessert deleted. Publish to make it live.") }
});
function afterP() { renderList(); fillGoSelects(); changed() }
function setDrop(src) { $("pDrop").querySelector("img")?.remove(); $("pDropTxt").hidden = !!src;
  if (src) { const im = document.createElement("img"); im.src = src; im.alt = ""; $("pDrop").appendChild(im) } }
const DEFAULT_SIZES = () => [{id: "single", name: "Single Serving", serves: "For one", price: 0}, {id: "large", name: "Large Tub", serves: "To share", price: 0}, {id: "dawat", name: "Dawat Serving", serves: "For the whole table", price: 0}];
function openEditor(i) {
  editing = i; pending = null; const p = i == null ? {sizes: DEFAULT_SIZES(), storage: "Keep refrigerated. Best enjoyed chilled."} : S.products[i];
  editId = i == null ? "" : p.id;
  SZ = JSON.parse(JSON.stringify(p.sizes || []));
  $("pEdTitle").textContent = i == null ? "New dessert" : "Edit " + p.name;
  $("pName").value = p.name || ""; $("pLine").value = p.line || ""; $("pDesc").value = p.desc || "";
  $("pIng").value = p.ingredients || ""; $("pAll").value = p.allergens || ""; $("pSto").value = p.storage || "";
  $("pBest").checked = !!p.best; $("pIsNew").checked = !!p.isNew; $("pOut").checked = !!p.soldOut; $("pMsg").textContent = "";
  setDrop(p.photo ? photoSrc(p.photo) : ""); renderSizes();
  $("pEditor").hidden = false; $("pEditor").scrollIntoView({behavior: "smooth", block: "start"}); $("pName").focus({preventScroll: true});
}
function renderSizes() {
  $("szRows").innerHTML = SZ.map((s, i) => `<div class="szrow">
    <label class="thumb" title="Size photo">${s.photo ? `<img src="${esc(photoSrc(s.photo))}" alt="">` : "Photo"}<input type="file" accept="image/*" data-szph="${i}" aria-label="Photo for ${esc(s.name || "this size")}"></label>
    <label class="fld">Size name<input data-sz="${i}|name" maxlength="30" value="${esc(s.name || "")}" placeholder="Large Tub"></label>
    <label class="fld">Serves<input data-sz="${i}|serves" maxlength="40" value="${esc(s.serves || "")}" placeholder="To share"></label>
    <label class="fld">Price (Rs)<input type="number" min="0" step="10" data-sz="${i}|price" value="${s.price || ""}" placeholder="1400"></label>
    <label class="fld">Was (sale)<input type="number" min="0" step="10" data-sz="${i}|was" value="${s.was || ""}" placeholder="Blank"></label>
    <div class="fld">Status<label class="switch"><input type="checkbox" data-szon="${i}"${s.soldOut ? "" : " checked"}><span class="knob" aria-hidden="true"></span><span class="st">${s.soldOut ? "Sold out" : "Available"}</span></label></div>
    <button class="sm red szx" type="button" data-szdel="${i}" aria-label="Remove this size">×</button>
  </div>`).join("") || `<p class="hint">No sizes yet. Select "+ Add size".</p>`;
}
$("szRows").addEventListener("input", e => { const f = e.target.dataset.sz; if (!f) return; const [i, k] = f.split("|"); SZ[+i][k] = k === "price" || k === "was" ? Math.max(0, Math.round(+e.target.value || 0)) : e.target.value });
$("szRows").addEventListener("change", async e => {
  const on = e.target.dataset.szon; if (on != null) { SZ[+on].soldOut = !e.target.checked; renderSizes(); return }
  const ph = e.target.dataset.szph; if (ph == null || !e.target.files[0]) return;
  toast("Preparing photo…");
  try { SZ[+ph].photo = await storePhoto(e.target.files[0], 1200, "products/" + (slug($("pName").value) || "dessert") + "-" + (slug(SZ[+ph].name) || "size")); renderSizes() } catch (err) { toast(PHOTO_ERR) }
});
$("szRows").addEventListener("click", e => { const d = e.target.closest("[data-szdel]"); if (d) { SZ.splice(+d.dataset.szdel, 1); renderSizes() } });
$("szAdd").onclick = () => { SZ.push({id: "", name: "", serves: "", price: 0}); renderSizes(); const ins = $("szRows").querySelectorAll('[data-sz$="|name"]'); ins[ins.length - 1].focus() };
$("pNewBtn").onclick = () => openEditor(null);
$("pCancel").onclick = () => { $("pEditor").hidden = true; editing = null; pending = null };
$("pPhoto").addEventListener("change", async e => {
  const f = e.target.files[0]; if (!f) return;
  $("pMsg").textContent = ""; $("pSave").disabled = true; $("pSave").textContent = "Preparing photo…";
  setDrop(URL.createObjectURL(f));
  try { pending = await storePhoto(f, 1400, "products/" + (slug($("pName").value) || "dessert")) } catch (err) { $("pMsg").textContent = PHOTO_ERR; pending = null; setDrop("") }
  $("pSave").disabled = false; $("pSave").textContent = "✓ Save dessert"; e.target.value = "";
});
$("pSave").onclick = () => {
  const name = $("pName").value.trim();
  if (!name) { $("pMsg").textContent = "Enter the dessert's name."; return }
  const sizes = SZ.map(s => ({...s, name: String(s.name || "").trim(), serves: String(s.serves || "").trim()})).filter(s => s.name || s.price);
  if (!sizes.length) { $("pMsg").textContent = "Add at least one size with a price."; return }
  const bad = sizes.find(s => !s.name || !(s.price > 0));
  if (bad) { $("pMsg").textContent = `Every size needs a name and a price. Check "${bad.name || "the size without a name"}".`; return }
  const badWas = sizes.find(s => s.was && s.was <= s.price);
  if (badWas) { $("pMsg").textContent = `The "Was" price for ${badWas.name} must be higher than its price, or left blank.`; return }
  /* sizes keep their id; a new size gets one from its name, so the same name in two desserts shares a filter */
  const used = new Set();
  sizes.forEach(s => { let id = s.id || slug(s.name) || "size"; const base = id; let n = 2; while (used.has(id)) id = base + "-" + n++; s.id = id; used.add(id); if (!s.was) s.was = 0; s.soldOut = !!s.soldOut });
  let id = editId;
  if (!id) { id = slug(name) || "dessert"; const base = id; let n = 2; while (S.products.some(p => p.id === id)) id = base + "-" + n++ }
  const base = editing == null ? {id, added: Date.now()} : S.products[editing];
  const p = {...base, name, line: $("pLine").value.trim(), desc: $("pDesc").value.trim(), ingredients: $("pIng").value.trim(), allergens: $("pAll").value.trim(), storage: $("pSto").value.trim(),
    best: $("pBest").checked, isNew: $("pIsNew").checked, soldOut: $("pOut").checked, sizes};
  if (pending) p.photo = pending;
  if (!p.photo) p.photo = (sizes.find(s => s.photo) || {}).photo || "";
  if (editing == null) S.products.push(p); else S.products[editing] = p;
  $("pEditor").hidden = true; editing = null; pending = null; afterP(); toast("Dessert saved. Publish to make it live.");
};

/* ---------- colour theme ---------- */
let PREVIEW = "", previewStarted = false;
function renderThemes() {
  const ph = (() => { const p = S.products[0]; return p ? photoSrc(sizePhoto(p, p.sizes[1] || p.sizes[0])) : "" })();
  $("tGrid").innerHTML = THEMES.map(t => { const c = t.c, vars = `--t-bg:${c.bg};--t-surface:${c.surface};--t-soft:${c.soft};--t-soft-ink:${c.softInk};--t-ink:${c.ink};--t-line:${c.line};--t-brand:${c.brand};--t-brand-ink:${c.brandInk};--t-accent:${c.accent};--t-accent-ink:${c.accentInk};--t-bar:${c.bar};--t-cloud:${c.logoCloud};--t-logo:${c.logoInk}`;
    const live = t.id === LIVE_THEME, chosen = t.id === S.theme && !live;
    return `<div class="tcard${t.id === S.theme ? " sel" : ""}" style="${vars}">
      <div class="tmock" aria-hidden="true"><div class="tm-bar"></div><div class="tm-head"><span class="tm-logo">CRUM</span><span class="tm-nav"><i></i><i></i><i></i></span></div>
        <div class="tm-hero"><div><div class="tm-h">Creamy layers, crunchy crumb</div><span class="tm-btn">Order now</span></div><div class="tm-pic" style="background-image:url('${esc(ph)}')"></div></div>
        <div class="tm-cards"><div class="tm-card"><span class="tm-price">Rs 500</span><span class="tm-add"></span></div><div class="tm-card"><span class="tm-price">Rs 1,400</span><span class="tm-add"></span></div></div></div>
      <div class="tinfo"><div><b>${esc(t.name)}</b>${live ? `<span class="live">Live</span>` : ""}${chosen ? `<span class="live chosen">Chosen · publish to apply</span>` : ""}</div><span class="hint">${esc(t.note)}</span>
        <div class="tacts"><button class="sm" type="button" data-tprev="${t.id}"${PREVIEW === t.id ? ' aria-pressed="true"' : ""}>${PREVIEW === t.id ? "Previewing" : "Preview"}</button>${t.id === S.theme ? "" : `<button class="sm brand" type="button" data-tuse="${t.id}">Use this theme</button>`}</div></div>
    </div>` }).join("");
}
let PREVIEW_F = "", LIVE_FONTS = "";
const frameSend = msg => { const f = $("tFrame"); try { if (f.dataset.ready === "1") f.contentWindow.postMessage(msg, location.origin) } catch (e) {} };
function previewLabel() {
  $("tpName").textContent = `Preview: ${themeById(PREVIEW).name} · ${fontsById(PREVIEW_F).name}`;
  $("tpOpen").href = (CFG.siteUrl || "../") + "?themes&theme=" + encodeURIComponent(PREVIEW) + "&font=" + encodeURIComponent(PREVIEW_F);
}
function previewTheme(id) {
  PREVIEW = id; if (!PREVIEW_F) PREVIEW_F = S.fonts || DEFAULT_FONTS; previewLabel();
  const f = $("tFrame");
  frameSend({type: "crum-theme", id});
  if (f.dataset.ready !== "1") { f.onload = () => { f.dataset.ready = "1"; frameSend({type: "crum-theme", id: PREVIEW}); frameSend({type: "crum-fonts", id: PREVIEW_F}) };
    f.src = "../?embed&theme=" + encodeURIComponent(id) + "&font=" + encodeURIComponent(PREVIEW_F) }
  renderThemes();
}
function previewFonts(id) { PREVIEW_F = id; if (!PREVIEW) PREVIEW = S.theme || DEFAULT_THEME; previewLabel(); frameSend({type: "crum-fonts", id}); renderFonts() }
function startPreview() { if (previewStarted) return; previewStarted = true; PREVIEW_F = S.fonts || DEFAULT_FONTS; previewTheme(S.theme || DEFAULT_THEME); renderFonts() }
function renderFonts() {
  $("fGrid").innerHTML = FONTS.map(f => { const live = f.id === LIVE_FONTS, chosen = f.id === S.fonts && !live;
    return `<div class="fcard${f.id === S.fonts ? " sel" : ""}">
      <div class="fsample"><span style="font-family:'${esc(f.display)}',serif;font-weight:${f.dw};font-size-adjust:${f.adj || "none"}">Dawat Serving</span><small style="font-family:'${esc(f.body)}',sans-serif">Tiramisu · Rs 4,500 · Add to cart</small></div>
      <div class="tinfo"><div><b>${esc(f.name)}</b>${live ? `<span class="live">Live</span>` : ""}${chosen ? `<span class="live chosen">Chosen · publish to apply</span>` : ""}</div><span class="hint">${esc(f.note)}</span>
        <div class="tacts"><button class="sm" type="button" data-fprev="${f.id}">${PREVIEW_F === f.id ? "Previewing" : "Preview"}</button>${f.id === S.fonts ? "" : `<button class="sm brand" type="button" data-fuse="${f.id}">Use this font style</button>`}</div></div>
    </div>` }).join("");
}
$("fGrid").addEventListener("click", e => {
  const pv = e.target.closest("[data-fprev]"), use = e.target.closest("[data-fuse]");
  if (pv) { previewFonts(pv.dataset.fprev); $("tFrameBox").scrollIntoView({behavior: "smooth", block: "start"}) }
  if (use) { S.fonts = use.dataset.fuse; previewFonts(S.fonts); changed(); toast(fontsById(S.fonts).name + " chosen. Select Publish changes to apply it.") }
});
$("tGrid").addEventListener("click", e => {
  const pv = e.target.closest("[data-tprev]"), use = e.target.closest("[data-tuse]");
  if (pv) { previewTheme(pv.dataset.tprev); $("tFrameBox").scrollIntoView({behavior: "smooth", block: "start"}) }
  if (use) { S.theme = use.dataset.tuse; previewTheme(S.theme); changed(); toast(themeById(S.theme).name + " chosen. Select Publish changes to apply it.") }
});
document.querySelectorAll("[data-dev]").forEach(b => b.onclick = () => {
  document.querySelectorAll("[data-dev]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
  $("tFrameBox").classList.toggle("phone", b.dataset.dev === "phone");
});

/* =====================================================================
   ADMIN ACCESS (private repository: admins.json = {"emails": [...]})
   The sign-in service lets these Gmail addresses in (each with its own password and the authenticator code). Saved immediately, not on Publish.
   ===================================================================== */
let ADMINS_LIST = [], ADMINS_DOC = {}, adminsSha = null, adminsBusy = false, ME = "";
const emailOk = s => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
async function loadAdmins() {
  $("admMsg").textContent = "";
  if (DEMO) { ADMINS_LIST = ADMINS_LIST.length ? ADMINS_LIST : ["yousaftahirkhan@gmail.com"]; renderAdmins(); return }
  if (!ORDERS_OK) { $("admList").innerHTML = `<p class="hint" style="padding:10px 12px">Admin access needs the private order storage. Sign in with your Gmail and password to manage it.</p>`; return }
  try {
    const f = await gh(`${ORD}/contents/admins.json`);
    ADMINS_DOC = JSON.parse(b64decUtf8(f.content || "")) || {}; ADMINS_LIST = (ADMINS_DOC.emails || []).map(s => String(s).toLowerCase()); adminsSha = f.sha;
  } catch (e) { if (e.status === 404) { ADMINS_DOC = {}; ADMINS_LIST = []; adminsSha = null } else { $("admMsg").textContent = "The admin list could not load. " + errText(e); return } }
  renderAdmins();
}
function renderAdmins() {
  const pw = ADMINS_DOC.passwords || {};
  $("admList").innerHTML = ADMINS_LIST.length ? ADMINS_LIST.map(em => `<div class="adm-row"><span class="em">${esc(em)}<small>${pw[em] ? "Password set" : "Creates a password at first sign-in"}</small></span>${em === ME ? `<span class="src">You</span>` : ""}${pw[em] ? `<button class="sm" type="button" data-admreset="${esc(em)}">Reset password</button>` : ""}<button class="sm red" type="button" data-admrm="${esc(em)}"${ADMINS_LIST.length < 2 ? ` disabled title="At least one admin is needed"` : ""}>Remove</button></div>`).join("")
    : `<p class="hint" style="padding:10px 12px">No list saved yet; the sign-in service uses the account set up with the website. Add your Gmail to start the list.</p>`;
}
/* Saves the list; password hashes of Gmails that stay are kept (resetPw removes one so it is created again). */
async function saveAdmins(next, message, resetPw) {
  const docFor = () => { const pw = {...(ADMINS_DOC.passwords || {})}; for (const k of Object.keys(pw)) if (!next.includes(k) || k === resetPw) delete pw[k]; return {...ADMINS_DOC, emails: next, passwords: pw} };
  if (DEMO) { ADMINS_DOC = docFor(); ADMINS_LIST = next; renderAdmins(); toast("Saved (local preview only)"); return true }
  if (adminsBusy) return false; adminsBusy = true;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const doc = docFor();
        const r = await gh(`${ORD}/contents/admins.json`, {method: "PUT", body: {message, content: b64encUtf8(JSON.stringify(doc, null, 1) + "\n"), ...(adminsSha ? {sha: adminsSha} : {})}});
        ADMINS_DOC = doc; ADMINS_LIST = next; adminsSha = r.content.sha; renderAdmins(); return true;
      } catch (e) { if ((e.status === 409 || e.status === 422) && attempt === 0) { await loadAdmins(); continue } throw e }
    }
  } catch (e) { $("admMsg").textContent = "Not saved. " + errText(e); return false }
  finally { adminsBusy = false }
  return false;
}
$("admForm").addEventListener("submit", async e => {
  e.preventDefault(); $("admMsg").textContent = "";
  const em = $("admNew").value.trim().toLowerCase();
  if (!emailOk(em)) { $("admMsg").textContent = "Enter a full Gmail address, for example name@gmail.com."; return }
  if (ADMINS_LIST.includes(em)) { $("admMsg").textContent = "This Gmail already has access."; return }
  $("admAdd").disabled = true;
  if (await saveAdmins([...ADMINS_LIST, em], "Admin access: add " + em)) { $("admNew").value = ""; toast(em + " can now sign in") }
  $("admAdd").disabled = false;
});
$("admList").addEventListener("click", async e => {
  const rp = e.target.closest("[data-admreset]");
  if (rp) { const em = rp.dataset.admreset;
    if (!confirm(`Reset the password for ${em}? At the next sign-in, that person creates a new password using the authenticator code.`)) return;
    rp.disabled = true; if (await saveAdmins(ADMINS_LIST, "Admin access: password reset for " + em, em)) toast("Password reset for " + em); else rp.disabled = false; return }
  const b = e.target.closest("[data-admrm]"); if (!b) return;
  const em = b.dataset.admrm; if (ADMINS_LIST.length < 2) return;
  if (!confirm(em === ME ? `You are signed in with ${em}. Remove it? You will not be able to sign in with this Gmail again.` : `Remove ${em}? This Gmail will no longer be able to sign in.`)) return;
  b.disabled = true;
  if (await saveAdmins(ADMINS_LIST.filter(x => x !== em), "Admin access: remove " + em)) toast(em + " removed"); else b.disabled = false;
});

/* Local preview only: made-up orders, one at each kind of step, so the order screen can be tried out. */
function sampleOrders() {
  const line = (pid, sid, qty) => { const l = findLine(S, pid + "|" + sid); return l ? {name: `${l.p.name} (${l.s.name})`, qty, price: l.s.price} : null };
  const mk = (n, name, area, its, status, daysAhead, extra = {}) => {
    const items = its.filter(Boolean), tot = items.reduce((s, i) => s + i.price * i.qty, 0), pct = advanceFor(S, tot), adv = pct >= 100 ? tot : Math.ceil(tot * pct / 100 / 10) * 10;
    const d = new Date(Date.now() + daysAhead * 864e5), need = d.toISOString().slice(0, 10);
    return {no: "CR-SAMPLE-" + n, items, sub: tot, del: 0, tot, pct, adv, rest: tot - adv, name, phone: "0300 0000000", city: "Lahore", area, addr: "House 1, Street 1",
      need, needTxt: fmtDate(need) + ", Evening (5pm–9pm)", note: "", status, at: Date.now() - n * 36e5, source: "website", proofs: [], ...extra};
  };
  return [mk(1, "Sample customer A", "Gulberg", [line("tiramisu", "large", 1), line("lotus", "single", 2)], "new", 2),
    mk(2, "Sample customer B", "DHA Phase 5", [line("lotus", "dawat", 1)], "new", 1, {proofs: [{p: "proofs/CR-SAMPLE-2-demo01.jpg", k: "advance", at: Date.now()}]}),
    mk(3, "Sample customer C", "Johar Town", [line("tiramisu", "dawat", 1)], "paid", 0)];
}

/* ---------- start ---------- */
(async () => {
  if (DEMO) {
    $("demoBar").hidden = false; ORDERS_OK = true; $("whoAmI").textContent = "Local preview";
    try { await loadContent(); ORDERS = sampleOrders(); openApp() } catch (e) { $("booting").textContent = "The local shop data could not load." }
    return;
  }
  const ret = takeAuthReturn();
  if (ret && ret.error) { showSignin(ret.error, "github"); return }
  if (ret && ret.token) { dropSession(); keepToken(ret.token, true, ret.expiresAt) }
  SESSION = loadSession();
  if (SESSION && CFG.authUrl) {
    try { MODE = "app"; const d = await refreshAppToken(); await signIn(TOKEN, "app", d.email); return }
    catch (e) { if (e.status === 401) dropSession(); SESSION = ""; showSignin(e.status === 401 ? "Your sign-in has expired. Please sign in again." : errText(e)); return }
  }
  const t = storedToken();
  if (!t) { showSignin(); return }
  try { await signIn(t) }
  catch (e) { if (e.status === 401 || e.notAdmin) dropToken(); showSignin(signInError(e), "token") }
})();
