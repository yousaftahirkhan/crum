/* Shared by the storefront and the super admin: shop data defaults, the logo, sizes and formatting helpers. */
"use strict";
const $ = id => document.getElementById(id);

/* Every section the shop data can hold, so a missing one never breaks a page. */
const SHOP_DEFAULTS = {theme: "crum", shop: {name: "Crum", city: "", wa: "", advancePct: 100, delFee: 0, areas: [], announce: []}, reg: {}, social: {}, pay: {accounts: []},
  slides: [], why: [], promo: {}, about: {}, policies: {}, reviews: [], products: []};
function normalizeShop(S) {
  S = S && typeof S === "object" ? S : {};
  for (const k in SHOP_DEFAULTS) if (S[k] == null) S[k] = JSON.parse(JSON.stringify(SHOP_DEFAULTS[k]));
  if (typeof S.shop.announce === "string") S.shop.announce = S.shop.announce ? [S.shop.announce] : [];
  S.products.forEach(p => { if (!Array.isArray(p.sizes)) p.sizes = [] });
  return S;
}

/* ---------- logo: the Crum cloud with the name and a heart (colours follow the theme) ---------- */
let logoN = 0;
function logoSVG(name) {
  const id = "lg" + (++logoN), word = esc(String(name || "Crum").toUpperCase().slice(0, 8));
  return `<svg class="crum-logo" viewBox="0 0 220 150" role="img" aria-label="${esc(name || "Crum")}">
    <path fill="var(--logo-cloud)" d="M44 46C36 18 74 4 94 22 104 2 142 2 152 24c24-16 58 4 46 34 22 12 14 52-12 54 0 26-42 34-58 16-16 20-58 16-62-6-32 8-52-22-36-42C4 70 18 38 44 46Z"/>
    <path id="${id}" d="M34 86Q110 50 186 86" fill="none"/>
    <text font-family="Fredoka,'Nunito',system-ui,sans-serif" font-weight="700" font-size="50" fill="var(--logo-ink)" letter-spacing="1"><textPath href="#${id}" startOffset="50%" text-anchor="middle">${word}</textPath></text>
    <path d="M110 132c-13-10-23-19-18-28 4-7 13-6 18 2 5-8 14-9 18-2 5 9-5 18-18 28Z" fill="none" stroke="var(--logo-ink)" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

/* ---------- formatting ---------- */
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
/* Photos are stored as paths inside the site (images/...). Pages in a sub-folder set data-base="../" on <html>.
   The admin keeps photos chosen but not yet published in PENDING_PHOTOS (path -> data URL). */
const ASSET_BASE = document.documentElement.dataset.base || "";
const PENDING_PHOTOS = new Map();
const photoSrc = ph => !ph ? "" : /^(data:|https?:|blob:)/i.test(ph) ? ph : PENDING_PHOTOS.has(ph) ? PENDING_PHOTOS.get(ph) : ASSET_BASE + ph;
const rs = n => "Rs " + (Math.round(Number(n)) || 0).toLocaleString("en-PK"); /* no-break space keeps "Rs" and the amount on one line */
const num = s => Number(String(s || "").replace(/[^\d]/g, "")) || 0;
const intl = p => { let d = String(p || "").replace(/\D/g, ""); if (d.startsWith("0")) d = "92" + d.slice(1); return d };
const fmtDate = s => { if (!s) return ""; const d = new Date(s + "T00:00:00"); return isNaN(d) ? s : d.toLocaleDateString("en-PK", {day: "numeric", month: "short", year: "numeric"}) };
const safeUrl = u => /^https?:\/\//i.test(u || "") ? u : "";
let toastTimer; function toast(t) { const el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.hidden = true, 2600) }

/* ---------- menu helpers ---------- */
/* A cart line is "productId|sizeId". */
const lineKey = (p, s) => p.id + "|" + s.id;
function findLine(S, key) {
  const [pid, sid] = String(key).split("|");
  const p = S.products.find(x => x.id === pid), s = p && p.sizes.find(x => x.id === sid);
  return p && s ? {p, s} : null;
}
const sizeAvailable = (p, s) => !p.soldOut && !s.soldOut && s.price > 0;
const sizePhoto = (p, s) => (s && s.photo) || p.photo || (p.sizes.find(x => x.photo) || {}).photo || "";
const fromPrice = p => { const l = p.sizes.filter(s => sizeAvailable(p, s)).map(s => s.price); return l.length ? Math.min(...l) : 0 };

/* Payment accounts the owner lists in the admin (Payment & delivery). Rows without a number or switched off are not shown. */
const PAY_METHODS = ["JazzCash", "Easypaisa", "SadaPay", "NayaPay", "Raast", "MCB Bank", "Meezan Bank", "HBL", "UBL", "Bank Alfalah", "Allied Bank", "Bank Al Habib", "Other bank"];
const payAccounts = S => (S.pay.accounts || []).filter(a => a && a.active !== false && String(a.number || "").trim())
  .map(a => ({k: a.method || "Bank transfer", v: String(a.number).trim(), who: String(a.title || "").trim()}));

/* Advance rule, set in the admin (Payments): orders below shop.advanceFrom (Rs) are cash on delivery; larger ones pay
   shop.advancePct at checkout, with the payment screenshot (0 = cash on delivery for every order, 100 = full payment).
   advanceFrom 0 means every order pays the advance. */
const advSetting = S => Math.min(100, Math.max(0, Math.round(+S.shop.advancePct || 0)));
const advFrom = S => Math.max(0, Math.round(+S.shop.advanceFrom || 0));
const advanceFor = (S, total) => advSetting(S) && total >= advFrom(S) ? advSetting(S) : 0;
const advName = pct => pct >= 100 ? "full payment in advance" : pct + "% advance";
function paymentSummary(S) {
  const pct = advSetting(S), from = advFrom(S);
  if (!pct) return "Every order is paid in cash on delivery.";
  const how = pct >= 100 ? "paid in full at checkout" : `confirmed with a ${pct}% advance, paid at checkout with the payment screenshot. The remaining amount is paid after we send you a photo of your ready order`;
  if (!from) return `Orders are ${how}.`;
  return `Orders under ${rs(from)} are paid in cash on delivery. Orders of ${rs(from)} or more are ${how}.`;
}
/* "How to order", written from the payment and delivery settings so it always matches them. */
function howtoSteps(S) {
  const pct = advSetting(S), from = advFrom(S), del = Math.max(0, Math.round(+S.shop.delFee || 0));
  const where = S.shop.city ? ` in ${S.shop.city}` : "", part = pct > 0 && pct < 100, what = pct >= 100 ? "the full amount" : `the ${pct}% advance`;
  const pay = !pct ? "Nothing is paid at checkout: every order is cash on delivery."
    : (from ? `Orders under ${rs(from)} are cash on delivery. For orders of ${rs(from)} or more, pay ${what}` : `Pay ${what}`) + " to one of the accounts shown at checkout and upload the screenshot.";
  return [
    "Add desserts to your cart and enter your delivery details.",
    pay,
    "Place the order. Your WhatsApp chat with us opens with your order ID; tap Send.",
    !pct ? "We confirm your order on WhatsApp." : from ? "We confirm your order on WhatsApp, after checking your payment if you paid at checkout." : "We check your payment and confirm your order on WhatsApp.",
    part ? (from ? "We prepare your desserts fresh. For advance orders, we send you a photo of your ready order." : "We prepare your desserts fresh and send you a photo of your ready order.") : "We prepare your desserts fresh for the date you choose.",
    (part ? `${from ? "For advance orders, you" : "You"} pay the remaining ${100 - pct}% after the photo. ` : "") + `Our rider delivers your order to your door${where}.` +
      (!pct ? " You pay in cash when it arrives." : from ? " Cash on delivery orders are paid when they arrive." : "") + (del ? ` The ${rs(del)} delivery charge is included in your total.` : " You pay the rider's fare.")
  ];
}
/* Lines added to the end of the terms, so payment and delivery terms always match the settings. */
const autoTerms = S => [paymentSummary(S), +S.shop.delFee > 0 ? `Delivery charge: ${rs(Math.round(+S.shop.delFee))}, included in your total.` : "The rider's fare is paid by the customer on delivery; it is not part of the order total."].filter(Boolean);

/* The safety promises shown to customers, built from the shop's settings so they always match. withAdvance adds the
   lines about paying an advance (leave it out for a cash on delivery order). */
function safetyLines(S, withAdvance = advSetting(S) > 0) {
  const title = ((S.pay.accounts || []).find(a => a && a.active !== false && String(a.number || "").trim() && String(a.title || "").trim()) || {}).title;
  return [
    withAdvance ? "We confirm your payment and your order on WhatsApp, with your order ID." : "Nothing is paid at checkout. We confirm your order with you on WhatsApp.",
    S.shop.wa ? `We only message you from our official WhatsApp number, ${S.shop.wa}.` : "",
    withAdvance ? (title ? `Pay only to the accounts shown here, in the name of ${String(title).trim()}. Check the name in your app before you send.` : "Pay only to the accounts shown here. Check the account name in your app before you send.") : "",
    withAdvance && advSetting(S) < 100 ? "You see a photo of your ready order before you pay the rest." : "",
    withAdvance ? "If we cannot deliver on your date, your payment is refunded in full." : "",
    "We will never ask for your PIN, OTP or card details."
  ].filter(Boolean);
}

/* Order IDs look like CR-261113-K7Q4: shop initials, order date (YYMMDD) and four random characters without
   look-alikes (no O/0, I/1, L), so customers can read them out on a call. */
function makeOrderNo(shopName) {
  const w = String(shopName || "").trim().split(/\s+/).filter(Boolean);
  const ini = (w.length > 1 ? w.map(x => x[0]).join("") : (w[0] || "").slice(0, 2)).replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "OR";
  const d = new Date(), p = n => String(n).padStart(2, "0");
  const A = "23456789ABCDEFGHJKMNPQRSTUVWXYZ", r = crypto.getRandomValues(new Uint8Array(4));
  return `${ini}-${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${Array.from(r, b => A[b % A.length]).join("")}`;
}

/* Turns a photo or screenshot into a JPEG of at most max pixels on the long side (white behind any transparency). */
async function toJpeg(file, max, q) {
  let src = null, url = "";
  if (window.createImageBitmap) { try { src = await createImageBitmap(file) } catch (e) { src = null } }
  if (!src) src = await new Promise((res, rej) => { url = URL.createObjectURL(file); const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("decode")); im.src = url });
  try {
    const w = src.width || src.naturalWidth, h = src.height || src.naturalHeight; if (!w || !h) throw new Error("decode");
    const s = Math.min(1, max / Math.max(w, h)), c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
    const x = c.getContext("2d"); x.fillStyle = "#FFFFFF"; x.fillRect(0, 0, c.width, c.height); x.drawImage(src, 0, 0, c.width, c.height);
    const b = await new Promise(r => c.toBlob(r, "image/jpeg", q || .82)); if (!b) throw new Error("decode"); return b;
  } finally { if (url) URL.revokeObjectURL(url) }
}
const blobB64 = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = () => rej(new Error("read")); r.readAsDataURL(b) });
