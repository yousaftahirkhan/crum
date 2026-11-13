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
async function ghOnce(path, {method = "GET", body, raw} = {}) {
  let r;
  try {
    r = await fetch("https://api.github.com" + path, {method, cache: "no-store",
      headers: {Authorization: "Bearer " + TOKEN, Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json", ...(body ? {"Content-Type": "application/json"} : {})},
      body: body ? JSON.stringify(body) : undefined});
  } catch (e) { throw new GHError(0, "No internet connection. Check your connection and try again.") }
  if (!r.ok) { let m = ""; try { m = (await r.json()).message || "" } catch (e) {} throw new GHError(r.status, m) }
  if (r.status === 204) return null;
  return raw ? r.text() : r.json();
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
  loadOrders(); loadAdmins();
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
  orders: ["Orders", "Website orders appear here automatically. Accept, approve the advance, then deliver."],
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
   ORDERS (private repository: orders.json)
   ===================================================================== */
/* Order steps: New order → (Accept: WhatsApp asks for the advance) → Awaiting advance → (Approve advance: WhatsApp
   thank-you) → Advance received → Out for delivery → Delivered. Only Accept and Approve send a message. */
const STATUS = [["new", "New order"], ["accepted", "Awaiting advance"], ["paid", "Confirmed"], ["sent", "Out for delivery"], ["done", "Delivered"], ["cancel", "Cancelled"]];
const STATUS_LBL = Object.fromEntries(STATUS);
const FILTERS = [["open", "Active"], ["new", "New"], ["accepted", "Awaiting advance"], ["paid", "Confirmed"], ["sent", "Out for delivery"], ["done", "Delivered"], ["cancel", "Cancelled"], ["all", "All"]];
let ORDERS = [], ordersSha = null, oFilter = "open", parsed = null, ordersBusy = false;

$("oFilter").innerHTML = FILTERS.map(([k, l]) => `<button class="chip" data-f="${k}" aria-pressed="${k === oFilter}">${l}</button>`).join("");
$("oFilter").addEventListener("click", e => { const b = e.target.closest("[data-f]"); if (!b) return; oFilter = b.dataset.f;
  $("oFilter").querySelectorAll(".chip").forEach(c => c.setAttribute("aria-pressed", c === b)); renderOrders() });
$("oSearch").addEventListener("input", () => renderOrders());
$("oRefresh").onclick = () => loadOrders(true);
document.addEventListener("visibilitychange", () => { if (!document.hidden && (TOKEN || DEMO) && !$("tab-orders").hidden) loadOrders() });
/* Website orders arrive on their own; check for new ones every minute while the Orders tab is open. */
setInterval(() => { if (!document.hidden && TOKEN && !$("tab-orders").hidden && !ordersBusy) loadOrders() }, 60e3);

async function fetchOrders() {
  if (DEMO) return {list: ORDERS, sha: "demo"};
  try {
    const f = await gh(`${ORD}/contents/orders.json`);
    const text = f.content ? b64decUtf8(f.content) : b64decUtf8((await gh(`${ORD}/git/blobs/${f.sha}`)).content);
    const list = JSON.parse(text || "[]");
    return {list: Array.isArray(list) ? list : [], sha: f.sha};
  } catch (e) { if (e.status === 404) return {list: [], sha: null}; throw e }
}
async function loadOrders(manual) {
  $("ordersOff").hidden = ORDERS_OK;
  if (!ORDERS_OK) { $("oList").innerHTML = `<div class="empty-box">Orders cannot be saved until order storage is connected.</div>`; renderStats(); return }
  if (!ORDERS.length && !ordersSha) $("oList").innerHTML = `<div class="empty-box">Loading orders…</div>`;
  try { const r = await fetchOrders(); ORDERS = r.list; ordersSha = r.sha; renderOrders(); if (manual) toast("Orders are up to date") }
  catch (e) { $("oList").innerHTML = `<div class="empty-box">Orders could not load. ${esc(errText(e))}</div>` }
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
        ORDERS = next; ordersSha = r.content.sha; renderOrders(); return true;
      } catch (e) {
        if ((e.status === 409 || e.status === 422) && attempt === 0) { const r = await fetchOrders(); ORDERS = r.list; ordersSha = r.sha; continue }
        throw e;
      }
    }
  } catch (e) { toast(errText(e)); return false }
  finally { ordersBusy = false }
  return false;
}
/* The only WhatsApp messages the shop sends: accepted (with the advance and account details), confirmed (thank you)
   and, if needed, cancelled. */
const advWord = o => { const p = o.pct || (o.tot ? Math.round(o.adv / o.tot * 100) : 0); return p >= 100 ? "full payment" : p + "% advance" };
function statusText(o, status) {
  const shop = S.shop.name || "Crum", hi = `Hello ${o.name || ""},`, id = `*${o.no}*`;
  const when = o.needTxt || (o.need ? fmtDate(o.need) : "");
  const delivery = when ? `Delivery: ${when}${o.area ? " · " + o.area : ""}` : "";
  const fare = o.del ? "" : "The delivery fare is paid to the rider.";
  const acc = payAccounts(S).map(a => `${a.k}: *${a.v}*${a.who ? " (" + a.who + ")" : ""}`);
  const T = {
    accepted: [`${hi} thank you for your order! Your order ${id} has been *accepted*.`, "",
      `Please send the ${advWord(o)} of *${rs(o.adv)}*${acc.length ? " to:" : ". We will share our account details here."}`, ...acc, "", "Then send the payment screenshot in this chat.",
      ...(o.rest ? [`The balance of ${rs(o.rest)} is paid on delivery.`] : []), "",
      "For your safety: please check the account name in your app before sending. We will never ask for your PIN or OTP, and if we cannot deliver, your advance is refunded in full."],
    paid: o.adv ? [`${hi} we have received your ${advWord(o)} of ${rs(o.adv)}. *Thank you!*`, "", `Your order ${id} is *confirmed*.`, ...(delivery ? [delivery] : []),
      ...(o.rest ? [`Please pay the balance of *${rs(o.rest)}* on delivery.`] : []), ...(fare ? [fare] : [])]
      : [`${hi} thank you for your order! Your order ${id} is *confirmed*.`, "", ...(delivery ? [delivery] : []), `Please pay *${rs(o.tot)}* on delivery.`, ...(fare ? [fare] : [])],
    cancel: [`${hi} we are sorry, your order ${id} has been *cancelled*.`, ...(o.cancelReason ? [`Reason: ${o.cancelReason}`] : []), "", "If you have any questions, please reply to this message."]
  }[status];
  if (!T) return "";
  return [...T, "", `— ${shop}`].join("\n");
}
const statusLink = (o, st) => `https://wa.me/${intl(o.phone)}?text=${encodeURIComponent(statusText(o, st))}`;

function renderStats() {
  const now = new Date(), m = now.getMonth(), y = now.getFullYear();
  const nNew = ORDERS.filter(o => o.status === "new").length;
  $("stCount").textContent = nNew; $("navNew").textContent = nNew; $("navNew").hidden = !nNew;
  $("stPending").textContent = ORDERS.filter(o => o.status === "accepted").length;
  $("stMonth").textContent = rs(ORDERS.filter(o => { const d = new Date(o.at); return o.status !== "cancel" && d.getMonth() === m && d.getFullYear() === y }).reduce((s, o) => s + (o.tot || 0), 0));
}
/* Needed today or tomorrow (and not finished yet). */
function isUrgent(o) {
  if (!o.need || ["done", "cancel", "sent"].includes(o.status)) return false;
  const d = new Date(o.need + "T00:00:00"), t = new Date(); t.setHours(0, 0, 0, 0);
  return (d - t) / 864e5 <= 1;
}
function renderFilterCounts() {
  const n = k => ORDERS.filter(o => k === "all" || (k === "open" ? !["done", "cancel"].includes(o.status) : o.status === k)).length;
  $("oFilter").querySelectorAll("[data-f]").forEach(b => { const k = b.dataset.f; b.textContent = `${FILTERS.find(f => f[0] === k)[1]} (${n(k)})` });
}
function renderOrders() {
  renderStats(); renderFilterCounts();
  ORDERS.sort((a, b) => (b.at || 0) - (a.at || 0));
  const q = $("oSearch").value.trim().toLowerCase(), qd = q.replace(/\D/g, "");
  const list = (q ? ORDERS : ORDERS.filter(o => oFilter === "all" || (oFilter === "open" ? !["done", "cancel"].includes(o.status) : o.status === oFilter)))
    .filter(o => !q || [o.no, o.name, o.phone, o.area].join(" ").toLowerCase().includes(q) || (qd.length >= 4 && String(o.phone).replace(/\D/g, "").includes(qd)));
  $("oList").innerHTML = list.length ? list.map(o => `<div class="ocard" data-s="${esc(o.status)}">
    <div class="ohead"><span class="no">${esc(o.no)}${o.source === "website" ? ` <span class="src">Website</span>` : ""}${isUrgent(o) ? ` <span class="src urgent">Urgent</span>` : ""}</span><span class="sub">${new Date(o.at).toLocaleDateString("en-PK", {day: "numeric", month: "short"})}${o.needTxt ? " · needed " + esc(o.needTxt) : ""}</span></div>
    <div><b>${esc(o.name || "—")}</b> <span class="sub">· ${esc(o.phone)}${o.area ? " · " + esc(o.area) : ""}</span></div>
    ${o.addr ? `<div class="sub">${esc(o.addr)}${o.city ? ", " + esc(o.city) : ""}</div>` : ""}
    ${o.items && o.items.length ? `<ul class="oitems">${o.items.map(i => `<li>${esc(i.name)} × ${i.qty}</li>`).join("")}</ul>` : ""}
    ${o.note ? `<div class="sub">Note: ${esc(o.note)}</div>` : ""}
    <div class="omoney"><span>Total <b>${rs(o.tot)}</b></span>${o.adv && o.rest ? `<span>Advance <b>${rs(o.adv)}</b></span><span>Balance <b>${rs(o.rest)}</b></span>` : ""}</div>
    ${o.rider ? `<div class="rider-info">Rider: <b>${esc(o.rider.name)}</b> · <a href="tel:${esc(o.rider.phone)}">${esc(o.rider.phone)}</a>${o.rider.vehicle ? " · " + esc(o.rider.vehicle) : ""}</div>` : ""}
    ${o.status === "new" ? `<div class="step-box"><span><b>Step 1.</b> ${o.adv > 0 ? `Check the order, then accept it. WhatsApp opens with a message asking for the ${esc(advWord(o))} of ${rs(o.adv)}${payAccounts(S).length ? " and your account details" : ""}.` : `Check the order, then accept it. This is a cash on delivery order (${rs(o.tot)}). WhatsApp opens with a confirmation for the customer.`}</span><button class="btn brand" type="button" data-accept="${esc(o.no)}">Accept order</button></div>` : ""}
    ${o.status === "accepted" ? `<div class="step-box warn"><span><b>Step 2.</b> When the customer sends the payment screenshot, open your JazzCash, Easypaisa or bank app and check that ${rs(o.adv)} has actually arrived (screenshots can be faked). Then approve it. WhatsApp opens with a thank-you message.</span><button class="btn brand" type="button" data-approve="${esc(o.no)}">Approve advance</button></div>` : ""}
    ${o.status === "paid" ? `<div class="step-box ok"><span><b>${o.adv > 0 ? "Step 3" : "Step 2"}.</b> Delivery.${o.adv > 0 ? "" : ` The rider collects ${rs(o.tot)} in cash.`} Add the rider's details if you like (only for your record), then mark the order out for delivery.</span>
      <div class="three" data-rform="${esc(o.no)}">
        <label class="fld">Rider name (optional)<input data-rf="name" maxlength="40" placeholder="Ali Raza"></label>
        <label class="fld">Rider phone (optional)<input data-rf="phone" inputmode="tel" maxlength="20" placeholder="0300 1234567"></label>
        <button class="btn dark" type="button" data-send="${esc(o.no)}" style="align-self:end">Out for delivery</button>
      </div></div>` : ""}
    ${o.status === "cancel" ? `<div class="cancel-info">Cancelled${o.cancelReason ? ": " + esc(o.cancelReason) : ""}</div>` : ""}
    <div class="ofoot">
      <span class="ostate">${esc(STATUS_LBL[o.status] || o.status)}</span>
      ${o.phone ? `<a class="sm green" href="https://wa.me/${intl(o.phone)}" target="_blank" rel="noopener">WhatsApp chat</a>` : ""}
      ${o.status === "sent" ? `<button class="sm" type="button" data-delivered="${esc(o.no)}">✓ Mark delivered</button>` : ""}
      ${["new", "accepted", "paid", "sent"].includes(o.status) ? `<button class="sm red" type="button" data-cancelopen="${esc(o.no)}">Cancel order</button>` : ""}
    </div>
    <div class="cancel-box" data-cbox="${esc(o.no)}" hidden>
      <label class="fld">Reason for cancelling (sent to the customer)<input data-creason maxlength="160" placeholder="e.g. Payment not received within 24 hours"></label>
      <div class="ofoot"><button class="btn" type="button" data-cancelgo="${esc(o.no)}" style="background:var(--bad);color:#fff;padding:8px 16px">Cancel order and tell the customer</button><button class="sm" type="button" data-cancelback="${esc(o.no)}">Keep order</button></div>
    </div></div>`).join("")
    : `<div class="empty-box">${q ? "No order found for this order number, name or phone number." : ORDERS.length ? "No orders with this status." : "No orders yet. Orders placed on the website appear here automatically."}</div>`;
}
$("oList").addEventListener("click", async e => {
  /* Accept and Approve each change the status and open WhatsApp with the message for the customer. */
  const step = async (btn, no, patch, msg, commit, done) => {
    const ord = ORDERS.find(o => o.no === no); if (!ord) return; btn.disabled = true;
    const win = ord.phone && msg ? window.open("", "_blank") : null;
    if (await mutateOrders(list => list.map(o => o.no === no ? {...o, ...patch} : o), commit)) {
      if (win) win.location.href = statusLink({...ord, ...patch}, msg); toast(done);
    } else { btn.disabled = false; if (win) win.close() }
  };
  const ac = e.target.closest("[data-accept]");
  if (ac) { const no = ac.dataset.accept, ord = ORDERS.find(o => o.no === no); if (!ord) return;
    if (ord.adv > 0) await step(ac, no, {status: "accepted", acceptedAt: Date.now()}, "accepted", `Order ${no}: accepted`, "Order accepted. Send the message in WhatsApp.");
    else await step(ac, no, {status: "paid", acceptedAt: Date.now()}, "paid", `Order ${no}: accepted (pay on delivery)`, "Order confirmed. Send the message in WhatsApp.");
    return }
  const ap = e.target.closest("[data-approve]");
  if (ap) { const no = ap.dataset.approve; await step(ap, no, {status: "paid", approvedAt: Date.now()}, "paid", `Order ${no}: advance approved`, "Advance approved. Send the thank-you message in WhatsApp."); return }
  const sd = e.target.closest("[data-send]");
  if (sd) {
    const no = sd.dataset.send, box = $("oList").querySelector(`[data-rform="${CSS.escape(no)}"]`);
    const val = k => box.querySelector(`[data-rf="${k}"]`).value.trim(), rider = {name: val("name"), phone: val("phone")};
    await step(sd, no, {status: "sent", sentAt: Date.now(), ...(rider.name || rider.phone ? {rider} : {})}, "", `Order ${no}: out for delivery`, "Marked out for delivery");
    return }
  const co = e.target.closest("[data-cancelopen]"), cb = e.target.closest("[data-cancelback]"), cg = e.target.closest("[data-cancelgo]"), dl = e.target.closest("[data-delivered]");
  const cbox = no => $("oList").querySelector(`[data-cbox="${CSS.escape(no)}"]`);
  if (co) { const b = cbox(co.dataset.cancelopen); b.hidden = false; b.querySelector("[data-creason]").focus(); return }
  if (cb) { cbox(cb.dataset.cancelback).hidden = true; return }
  if (cg) {
    const no = cg.dataset.cancelgo, reason = cbox(no).querySelector("[data-creason]").value.trim(), ord = ORDERS.find(o => o.no === no);
    if (!reason) { toast("Please write the reason for cancelling."); return }
    const win = ord && ord.phone ? window.open("", "_blank") : null; cg.disabled = true;
    if (await mutateOrders(list => list.map(o => o.no === no ? {...o, status: "cancel", cancelReason: reason, cancelledAt: Date.now()} : o), `Order ${no}: cancelled (${reason})`)) {
      if (win) win.location.href = statusLink(ORDERS.find(o => o.no === no), "cancel");
      toast("Order cancelled. Send the message to the customer in WhatsApp.");
    } else { cg.disabled = false; if (win) win.close() }
    return;
  }
  if (dl) { const no = dl.dataset.delivered; dl.disabled = true;
    if (await mutateOrders(list => list.map(o => o.no === no ? {...o, status: "done", deliveredAt: Date.now()} : o), `Order ${no}: delivered`)) toast("Marked as delivered"); else dl.disabled = false; return }
});

/* Reads a WhatsApp order message (the format the storefront sends) back into fields. */
function parseOrder(raw) {
  const t = raw.replace(/\*/g, "").replace(/\r/g, "");
  const g = re => { const m = t.match(re); return m ? m[1].trim() : "" };
  const items = []; t.split("\n").forEach(l => { const m = l.match(/^\s*[•\-]\s*(.+?)\s+[x×]\s*(\d+)\s*(?:=|—|–|-)\s*Rs\.?\s*([\d,]+)/i); if (m) { const q = +m[2]; items.push({name: m[1].trim(), qty: q, price: Math.round(num(m[3]) / q)}) } });
  const o = {no: g(/Order ID\s*[—–\-:#*]*\s*\*?([A-Z]{1,4}-\d{6}-[0-9A-Z]{4})/i).toUpperCase(), items,
    del: num(g(/(?:^|\n)\s*Delivery:\s*Rs\.?\s*([\d,]+)/i)), tot: num(g(/(?:^|\n)\s*Total:\s*Rs\.?\s*([\d,]+)/i)), adv: num(g(/(?:Advance[^:\n]*|Paying in full now):\s*Rs\.?\s*([\d,]+)/i)),
    name: g(/Name:\s*(.+)/i), phone: g(/Phone:\s*(.+)/i), city: g(/City:\s*(.+)/i), addr: g(/Address:\s*(.+)/i), area: g(/Area:\s*(.+)/i),
    needTxt: g(/Needed by:\s*(.+)/i), need: (() => { const m = g(/Needed by:\s*(\d{1,2} \w{3} \d{4})/i); const d = m ? new Date(m) : null; return d && !isNaN(d) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "" })(), note: g(/Note:\s*(.+)/i)};
  if (!o.tot && items.length) o.tot = items.reduce((s, i) => s + i.price * i.qty, 0) + o.del;
  if (!o.no) o.no = makeOrderNo(S.shop.name);
  o.rest = Math.max(0, o.tot - o.adv);
  return (o.name || o.phone || items.length) ? o : null;
}
$("pasteRead").onclick = () => {
  parsed = parseOrder($("pasteBox").value);
  if (!parsed) { $("pastePreview").innerHTML = `<p class="msg err" style="text-align:left">No order was found in this message. Paste the customer's full order message.</p>`; $("pasteSave").disabled = true; return }
  const dup = ORDERS.some(o => o.no === parsed.no);
  $("pastePreview").innerHTML = `<div class="preview"><b>${esc(parsed.no)}</b> · ${esc(parsed.name)} · ${esc(parsed.phone)}<br>${parsed.items.map(i => esc(i.name) + " × " + i.qty).join(", ") || "No items found"}<br>Total ${rs(parsed.tot)}${parsed.adv ? ` · Paid now ${rs(parsed.adv)}` : ""}${dup ? `<br><b style="color:var(--bad)">This order is already saved. Saving again will replace it.</b>` : ""}</div>`;
  $("pasteSave").disabled = !ORDERS_OK;
};
$("pasteSave").onclick = async () => {
  if (!parsed || !ORDERS_OK) return; $("pasteSave").disabled = true;
  const o = {...parsed, status: "new", at: Date.now()};
  if (await mutateOrders(list => [o, ...list.filter(x => x.no !== o.no)], `Add order ${o.no}`)) {
    $("pasteBox").value = ""; $("pastePreview").innerHTML = ""; parsed = null; toast("Order " + o.no + " saved");
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

/* Local preview only: three made-up orders, one at each step, so the order screen can be tried out. */
function sampleOrders() {
  const line = (pid, sid, qty) => { const l = findLine(S, pid + "|" + sid); return l ? {name: `${l.p.name} (${l.s.name})`, qty, price: l.s.price} : null };
  const mk = (n, name, area, its, status, daysAhead) => {
    const items = its.filter(Boolean), tot = items.reduce((s, i) => s + i.price * i.qty, 0), pct = advanceFor(S, tot), adv = pct >= 100 ? tot : Math.ceil(tot * pct / 100 / 10) * 10;
    const d = new Date(Date.now() + daysAhead * 864e5), need = d.toISOString().slice(0, 10);
    return {no: "CR-SAMPLE-" + n, items, sub: tot, del: 0, tot, pct, adv, rest: tot - adv, name, phone: "0300 0000000", city: "Lahore", area, addr: "House 1, Street 1",
      need, needTxt: fmtDate(need) + ", Evening (5pm–9pm)", note: "", status, at: Date.now() - n * 36e5, source: "website"};
  };
  return [mk(1, "Sample customer A", "Gulberg", [line("tiramisu", "large", 1), line("lotus", "single", 2)], "new", 2),
    mk(2, "Sample customer B", "DHA Phase 5", [line("lotus", "dawat", 1)], "accepted", 1),
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
