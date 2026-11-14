/* Storefront: customers browse the menu, choose a size, fill the cart and place the order on WhatsApp.
   Nothing here edits the shop; all content comes from data/shop.json, which the super admin (admin/) publishes. */
"use strict";
const CFG = window.CRUM_CONFIG || {};
const QS = new URLSearchParams(location.search);
const EMBED = QS.has("embed");                        /* shown inside the super admin's theme preview */
const PREVIEW_THEME = QS.get("theme") || "";          /* ?theme=caramel previews a theme without publishing it */
const PREVIEW_FONTS = QS.get("font") || "";           /* ?font=boutique previews a font style */
let S = normalizeShop({});
applyTheme(PREVIEW_THEME || DEFAULT_THEME); applyFonts(PREVIEW_FONTS || DEFAULT_FONTS);

/* ---------- this device's cart, details and past orders ---------- */
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || "null") || d } catch (e) { return d } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch (e) {} };
let cart = load("crum-cart", {}), myOrders = load("crum-orders", []), loc = load("crum-loc", {});
const persist = () => save("crum-cart", cart);

/* ---------- menu items: every product in every size ---------- */
const sizeKey = s => String(s.name || "").trim().toLowerCase();
function items() {
  const out = [];
  S.products.forEach((p, pi) => p.sizes.forEach((s, si) => { if (s.name && s.price > 0) out.push({p, s, key: lineKey(p, s), order: pi * 100 + si}) }));
  return out;
}
function sizeList() {
  const seen = new Map();
  S.products.forEach(p => p.sizes.forEach(s => { const k = sizeKey(s); if (k && !seen.has(k)) seen.set(k, s.name.trim()) }));
  return [...seen].map(([k, l]) => ({k, l}));
}
const PRICE_BANDS = [["u1000", "Under Rs 1,000", x => x < 1000], ["1to3", "Rs 1,000 to Rs 3,000", x => x >= 1000 && x <= 3000], ["o3000", "Above Rs 3,000", x => x > 3000]];

/* ---------- filters ---------- */
const F = {products: new Set(), sizes: new Set(), prices: new Set(), stock: false, sort: "feat"};
function matches(it, skip) {
  return (skip === "products" || !F.products.size || F.products.has(it.p.id)) &&
    (skip === "sizes" || !F.sizes.size || F.sizes.has(sizeKey(it.s))) &&
    (skip === "prices" || !F.prices.size || PRICE_BANDS.some(([k, , t]) => F.prices.has(k) && t(it.s.price))) &&
    (!F.stock || sizeAvailable(it.p, it.s));
}
/* go: "all", a product id, or "size:<size id>" */
function go(target, scroll = true) {
  F.products.clear(); F.sizes.clear(); F.prices.clear(); F.stock = false;
  const t = String(target || "all");
  if (t.startsWith("size:")) { const id = t.slice(5); for (const p of S.products) { const s = p.sizes.find(x => x.id === id); if (s) { F.sizes.add(sizeKey(s)); break } } }
  else if (t !== "all" && S.products.some(p => p.id === t)) F.products.add(t);
  renderShop(); show(null);
  if (scroll) $("menu").scrollIntoView({behavior: "smooth"});
}

/* ---------- product card ---------- */
function card(it) {
  const {p, s, key} = it, ok = sizeAvailable(p, s), q = cart[key] || 0;
  const badge = !ok ? `<span class="badge out">Sold out</span>` : s.was > s.price ? `<span class="badge sale">${Math.round((1 - s.price / s.was) * 100)}% off</span>` : p.isNew ? `<span class="badge">New</span>` : p.best ? `<span class="badge">Bestseller</span>` : "";
  const ph = sizePhoto(p, s);
  return `<article class="card" data-key="${esc(key)}">
    <button class="pic" type="button" data-pv="${esc(p.id)}" data-sz="${esc(s.id)}" aria-label="${esc(p.name)}, ${esc(s.name)}: view details">${ph ? `<img src="${esc(photoSrc(ph))}" alt="" loading="lazy">` : ""}${badge}</button>
    <div class="body">
      <span class="szp">${esc(s.name)}</span>
      <h3><button type="button" data-pv="${esc(p.id)}" data-sz="${esc(s.id)}">${esc(p.name)}</button></h3>
      ${s.serves ? `<span class="serves">${esc(s.serves)}</span>` : ""}
      <div class="row">
        <span class="price">${rs(s.price)}${s.was > s.price ? `<s>${rs(s.was)}</s>` : ""}</span>
        ${!ok ? `<button class="add" type="button" disabled>Sold out</button>` : q ? `<div class="stepper" role="group" aria-label="Quantity of ${esc(p.name)}, ${esc(s.name)}"><button type="button" data-step="${esc(key)}" data-d="-1" aria-label="Remove one">−</button><span>${q}</span><button type="button" data-step="${esc(key)}" data-d="1" aria-label="Add one">+</button></div>` : `<button class="add" type="button" data-add="${esc(key)}" aria-label="Add ${esc(p.name)}, ${esc(s.name)} to cart">Add<span class="tc">to cart</span></button>`}
      </div>
    </div>
  </article>`;
}

/* ---------- collection: filters, sort and grid ---------- */
function fRow(group, k, label, n, on) {
  return `<label class="fchk"><input type="checkbox" data-fg="${group}" value="${esc(k)}"${on ? " checked" : ""}> ${esc(label)} <span class="n">${n}</span></label>`;
}
function renderShop() {
  const all = items();
  const count = (skip, test) => all.filter(it => matches(it, skip) && test(it)).length;
  $("fProducts").innerHTML = S.products.map(p => fRow("products", p.id, p.name, count("products", it => it.p.id === p.id), F.products.has(p.id))).join("");
  $("fSizes").innerHTML = sizeList().map(z => fRow("sizes", z.k, z.l, count("sizes", it => sizeKey(it.s) === z.k), F.sizes.has(z.k))).join("");
  $("fPrices").innerHTML = PRICE_BANDS.map(([k, l, t]) => ({k, l, n: count("prices", it => t(it.s.price))})).filter(b => b.n || F.prices.has(b.k)).map(b => fRow("prices", b.k, b.l, b.n, F.prices.has(b.k))).join("");
  $("fStock").checked = F.stock;

  let list = all.filter(it => matches(it));
  if (F.sort === "feat") list.sort((a, b) => a.order - b.order);
  if (F.sort === "low") list.sort((a, b) => a.s.price - b.s.price);
  if (F.sort === "high") list.sort((a, b) => b.s.price - a.s.price);
  if (F.sort === "az") list.sort((a, b) => a.p.name.localeCompare(b.p.name) || a.order - b.order);
  $("count").textContent = list.length + (list.length === 1 ? " result" : " results");
  $("grid").innerHTML = list.length ? list.map(card).join("") : `<div class="empty-box">Nothing matches these filters. <button class="link" type="button" data-go="all">Show the full menu</button></div>`;

  const onlyP = F.products.size === 1 && !F.sizes.size ? S.products.find(p => F.products.has(p.id)) : null;
  const onlyS = F.sizes.size === 1 && !F.products.size ? sizeList().find(z => F.sizes.has(z.k)) : null;
  const title = onlyP ? onlyP.name : onlyS ? onlyS.l : "Our menu";
  $("collTitle").textContent = title; $("crumbNow").textContent = title;
  $("collSub").textContent = onlyP ? onlyP.line || "" : onlyS ? `Every dessert in the ${onlyS.l} size.` : S.shop.tagline || "";

  const act = [...[...F.products].map(id => ["products", id, (S.products.find(p => p.id === id) || {}).name]), ...[...F.sizes].map(k => ["sizes", k, (sizeList().find(z => z.k === k) || {}).l]),
    ...[...F.prices].map(k => ["prices", k, (PRICE_BANDS.find(b => b[0] === k) || [])[1]]), ...(F.stock ? [["stock", "1", "In stock"]] : [])].filter(a => a[2]);
  $("activeF").innerHTML = act.map(([g, k, l]) => `<button class="af" type="button" data-unf="${g}|${esc(k)}" aria-label="Remove filter ${esc(l)}">${esc(l)} ×</button>`).join("") + (act.length > 1 ? `<button class="link" type="button" data-go="all">Clear all</button>` : "");
  $("fN").textContent = act.length; $("fN").hidden = !act.length;

  const plain = !F.prices.size && !F.stock;
  const pillOn = t => t === "all" ? !act.length : t.startsWith("size:") ? plain && !!onlyS && S.products.some(p => p.sizes.some(s => s.id === t.slice(5) && sizeKey(s) === onlyS.k)) : plain && !!onlyP && onlyP.id === t;
  $("pills").querySelectorAll("[data-go]").forEach(b => b.setAttribute("aria-pressed", String(!!pillOn(b.dataset.go))));
}
$("filters").addEventListener("change", e => {
  const c = e.target;
  if (c.id === "fStock") F.stock = c.checked;
  else if (c.dataset.fg) { const set = F[c.dataset.fg]; c.checked ? set.add(c.value) : set.delete(c.value) }
  renderShop();
});
$("activeF").addEventListener("click", e => { const b = e.target.closest("[data-unf]"); if (!b) return; const [g, k] = b.dataset.unf.split("|"); if (g === "stock") F.stock = false; else F[g].delete(k); renderShop() });
$("fClear").onclick = () => go("all", false);
$("sort").onchange = e => { F.sort = e.target.value; renderShop() };
$("fOpen").onclick = () => { $("filters").classList.add("open"); $("scrim").hidden = false };
const closeFilters = () => { $("filters").classList.remove("open"); if (!openPanel) $("scrim").hidden = true };
$("fClose").onclick = closeFilters; $("fDone").onclick = closeFilters;

/* ---------- hero, pills, why, promo, steps, story, contact, footer ---------- */
/* Hero: the photos cross-fade with a slow zoom and change on their own; the text changes with them. */
const SLIDE_MS = 5500, CALM = matchMedia("(prefers-reduced-motion: reduce)").matches;
let slideI = 0, slideT = null;
const slideList = () => S.slides.filter(s => s && s.title);
const anyPhoto = () => { for (const p of S.products) { const ph = sizePhoto(p, p.sizes[1] || p.sizes[0]); if (ph) return ph } return "" };
function renderHero() {
  const sl = slideList();
  if (!sl.length) { $("heroText").innerHTML = $("heroMedia").innerHTML = $("dots").innerHTML = ""; return }
  slideI = Math.min(slideI, sl.length - 1);
  $("heroMedia").innerHTML = sl.map((s, i) => `<img src="${esc(photoSrc(s.photo || anyPhoto()))}" alt=""${i === slideI ? ` class="on"` : ` loading="lazy"`}>`).join("");
  $("dots").style.setProperty("--slide-ms", SLIDE_MS + "ms");
  $("dots").innerHTML = sl.length > 1 ? sl.map((s, i) => `<button type="button" data-dot="${i}" aria-label="Show slide ${i + 1}: ${esc(s.kicker || s.title)}" aria-current="${i === slideI}"></button>`).join("") : "";
  slideText(); restartSlides();
}
function slideText() {
  const s = slideList()[slideI], el = $("heroText"); if (!s) return;
  el.classList.remove("in"); void el.offsetWidth;
  el.innerHTML = `${s.kicker ? `<span class="eyebrow">${esc(s.kicker)}</span>` : ""}<h1>${esc(s.title)}</h1>${s.text ? `<p>${esc(s.text)}</p>` : ""}
    <div class="acts"><button class="btn brand" type="button" data-go="${esc(s.go || "all")}">${esc(s.btn || "Order now")}</button><button class="btn ghost" type="button" data-go="all">View the menu</button></div>`;
  el.classList.add("in");
}
function restartSlides() { clearInterval(slideT); if (slideList().length > 1 && !CALM) slideT = setInterval(() => goSlide(slideI + 1), SLIDE_MS) }
function goSlide(i) {
  const n = slideList().length; if (!n) return; slideI = (i + n) % n;
  $("heroMedia").querySelectorAll("img").forEach((im, k) => { im.classList.remove("on"); if (k === slideI) { im.loading = "eager"; void im.offsetWidth; im.classList.add("on") } });
  $("dots").querySelectorAll("[data-dot]").forEach((el, k) => el.setAttribute("aria-current", k === slideI));
  slideText();
}
$("dots").addEventListener("click", e => { const d = e.target.closest("[data-dot]"); if (d) { goSlide(+d.dataset.dot); restartSlides() } });

/* A moving strip of every dessert photo (the list is repeated once so it loops without a gap). */
function renderStrip() {
  const its = items().filter(it => sizePhoto(it.p, it.s));
  $("stripSec").hidden = !its.length;
  const fig = (it, hide) => `<figure${hide ? ` aria-hidden="true"` : ""}><img src="${esc(photoSrc(sizePhoto(it.p, it.s)))}" alt="${hide ? "" : esc(it.p.name + ", " + it.s.name)}" loading="lazy"><figcaption><b>${esc(it.p.name)}</b>${esc(it.s.name)} · ${rs(it.s.price)}</figcaption></figure>`;
  $("track").innerHTML = its.map(it => fig(it)).join("") + (CALM ? "" : its.map(it => fig(it, true)).join(""));
}
/* The Dawat banner's photo changes between the desserts on its own. */
let promoT = null;
function promoPhotos(p) {
  const out = [p.photo]; const id = String(p.go || "").startsWith("size:") ? p.go.slice(5) : "";
  S.products.forEach(x => { const s = x.sizes.find(z => z.id === id) || x.sizes[x.sizes.length - 1]; out.push(sizePhoto(x, s)) });
  return [...new Set(out.filter(Boolean))];
}

function renderPills() {
  const sizes = [];
  S.products.forEach(p => p.sizes.forEach(s => { if (s.id && s.name && !sizes.some(x => sizeKey(x) === sizeKey(s))) sizes.push(s) }));
  $("pills").innerHTML = [["all", "All"], ...S.products.map(p => [p.id, p.name]), ...sizes.map(s => ["size:" + s.id, s.name])]
    .map(([k, l]) => `<button class="pill" type="button" data-go="${esc(k)}" aria-pressed="false">${esc(l)}</button>`).join("");
}
const WHY_ICONS = [
  `<path d="M5 9h14l-1.4 10.2a2 2 0 0 1-2 1.8H8.4a2 2 0 0 1-2-1.8z"/><path d="M4 9h16M9 5.5c0-1 1-1.5 3-1.5s3 .5 3 1.5"/>`,
  `<rect x="3" y="5" width="18" height="4" rx="1"/><rect x="5" y="10" width="14" height="4" rx="1"/><rect x="7" y="15" width="10" height="4" rx="1"/>`,
  `<path d="M4 5h16v10H9l-5 4z"/><path d="M8 10h8"/>`];
function renderWhy() {
  const w = (S.why || []).filter(x => x && x.t);
  $("whySec").hidden = !w.length;
  $("why").innerHTML = w.map((x, i) => `<div class="wy"><span class="ic"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${WHY_ICONS[i % 3]}</svg></span><b>${esc(x.t)}</b>${x.x ? `<span>${esc(x.x)}</span>` : ""}</div>`).join("");
}
function renderPromo() {
  const p = S.promo || {}; $("promoSec").hidden = !p.title; clearInterval(promoT);
  if (!p.title) { $("promo").innerHTML = ""; return }
  const ph = promoPhotos(p);
  $("promo").innerHTML = `<div class="txt">${p.kicker ? `<span class="eyebrow">${esc(p.kicker)}</span>` : ""}<h2>${esc(p.title)}</h2>${p.text ? `<p>${esc(p.text)}</p>` : ""}<button class="btn brand" type="button" data-go="${esc(p.go || "all")}">${esc(p.btn || "Order now")}</button></div>
    <div class="hero-media" id="promoMedia">${ph.map((x, i) => `<img src="${esc(photoSrc(x))}" alt="" loading="lazy"${i ? "" : ` class="on"`}>`).join("")}</div>`;
  if (ph.length > 1 && !CALM) { let k = 0; promoT = setInterval(() => { const ims = $("promoMedia").querySelectorAll("img"); ims[k].classList.remove("on"); k = (k + 1) % ims.length; void ims[k].offsetWidth; ims[k].classList.add("on") }, 4000) }
}
/* The owner's own steps if they wrote some in the admin; otherwise written from the payment settings. */
const stepLines = () => { const t = String((S.policies || {}).howto || "").split("\n").map(l => l.replace(/^\s*\d+[.)]\s*/, "").trim()).filter(Boolean); return t.length ? t : howtoSteps(S) };
function renderSteps() {
  const t = stepLines();
  $("howto").hidden = !t.length;
  $("steps").innerHTML = t.map(l => `<li>${esc(l)}</li>`).join("");
}
function renderReviews() {
  const r = (S.reviews || []).filter(x => x && x.text); $("revSec").hidden = !r.length;
  $("reviews").innerHTML = r.map(x => `<figure class="rev"><q>${esc(x.text)}</q><span>${esc(x.name || "Customer")}${x.city ? " · " + esc(x.city) : ""}</span></figure>`).join("");
}
function renderStory() {
  const a = S.about || {}; $("story").hidden = !a.title && !a.text;
  $("storyTitle").textContent = a.title || "";
  $("storyText").innerHTML = String(a.text || "").split(/\n{2,}/).map(p => `<p>${esc(p)}</p>`).join("");
  $("storyArt").innerHTML = a.photo ? `<div class="plate"><img src="${esc(photoSrc(a.photo))}" alt="" loading="lazy"></div>` : logoSVG(S.shop.name);
}
const waChat = text => "https://wa.me/" + intl(S.shop.wa) + "?text=" + encodeURIComponent(text);
function renderChrome() {
  const s = S.shop, name = s.name || "Crum";
  document.title = name + " | " + (S.products.map(p => p.name).join(" and ") || "Desserts");
  $("logo").innerHTML = logoSVG(name); $("footLogo").innerHTML = logoSVG(name); $("menuLogo").innerHTML = logoSVG(name);
  $("logo").setAttribute("aria-label", name + " home");
  $("footAbout").textContent = s.footAbout || "";
  const hasWa = intl(s.wa).length >= 11, wa = waChat("Hello! I have a question about " + name + ".");
  $("waFloat").hidden = !hasWa || EMBED; $("waFloat").href = wa;
  $("menuWa").hidden = !hasWa; $("menuWa").href = wa;
  $("navProducts").innerHTML = S.products.map(p => `<a href="#menu" data-go="${esc(p.id)}">${esc(p.name)}</a>`).join("");
  $("footMenu").innerHTML = S.products.map(p => `<li><button class="fl" type="button" data-go="${esc(p.id)}">${esc(p.name)}</button></li>`).join("") +
    sizeList().map(z => { const s0 = S.products.flatMap(p => p.sizes).find(x => sizeKey(x) === z.k); return s0 && s0.id ? `<li><button class="fl" type="button" data-go="size:${esc(s0.id)}">${esc(z.l)}</button></li>` : "" }).join("");
  $("menuList").innerHTML = S.products.map(p => { const ph = sizePhoto(p, p.sizes[1] || p.sizes[0]), f = fromPrice(p);
    return `<button class="mi" type="button" data-go="${esc(p.id)}"><span class="th">${ph ? `<img src="${esc(photoSrc(ph))}" alt="">` : ""}</span><span><b>${esc(p.name)}</b><span class="s">${p.sizes.length} sizes${f ? " · from " + rs(f) : ""}</span></span><span aria-hidden="true">›</span></button>` }).join("");
  const soc = [["insta", "Instagram"], ["fb", "Facebook"], ["tiktok", "TikTok"]].filter(([k]) => safeUrl(S.social[k]));
  $("social").innerHTML = soc.map(([k, l]) => `<a href="${esc(safeUrl(S.social[k]))}" target="_blank" rel="noopener">${l}</a>`).join("");
  const fc = []; if (s.wa) fc.push("WhatsApp: " + s.wa); if (s.phone) fc.push("Call: " + s.phone); if (s.email) fc.push(s.email); if (s.address || s.city) fc.push(s.address || s.city); if (s.hours) fc.push(s.hours);
  $("footContact").innerHTML = fc.map(x => `<li>${esc(x)}</li>`).join("") || `<li>Order on this website</li>`;
  const r = S.reg || {};
  $("copy").textContent = "© " + new Date().getFullYear() + " " + (r.business || name) + (r.since ? " · Since " + r.since : "");
  const rp = []; if (r.business && r.business !== name) rp.push("Registered as " + r.business); if (r.regNo) rp.push("Reg. No. " + r.regNo); if (r.ntn) rp.push("NTN " + r.ntn);
  $("regLine").textContent = rp.join(" · ");
  const boxes = [];
  if (hasWa) boxes.push(`<div class="cbox"><span class="k">WhatsApp</span><span class="v">${esc(s.wa)}</span><span class="s">Orders, dawat bookings and questions</span><a class="btn wa" style="align-self:start;margin-top:8px" href="${esc(wa)}" target="_blank" rel="noopener">Start a chat</a></div>`);
  if (s.phone || s.email) boxes.push(`<div class="cbox"><span class="k">Call or email</span>${s.phone ? `<span class="v">${esc(s.phone)}</span>` : ""}${s.email ? `<span class="v">${esc(s.email)}</span>` : ""}</div>`);
  if (s.city || s.address || s.hours) boxes.push(`<div class="cbox"><span class="k">Based in</span><span class="v">${esc(s.address || s.city)}</span><span class="s">${esc([s.hours, s.city ? "Delivery within " + s.city + ". " + (s.delText || "") : s.delText || ""].filter(Boolean).join("\n"))}</span></div>`);
  if (soc.length) boxes.push(`<div class="cbox"><span class="k">Follow us</span><span class="s">New flavours and offers appear here first</span><div class="social">${soc.map(([k, l]) => `<a class="sm" href="${esc(safeUrl(S.social[k]))}" target="_blank" rel="noopener">${l}</a>`).join("")}</div></div>`);
  if (!boxes.length) boxes.push(`<div class="cbox"><span class="k">Order online</span><span class="s">Add your desserts to the cart and place your order on this website.</span></div>`);
  $("contactBoxes").innerHTML = boxes.join("");
  renderLocation();
}

/* ---------- announcement bar ---------- */
let annI = 0, annT = null;
function renderAnnounce() {
  const a = (S.shop.announce || []).filter(Boolean);
  $("announceBar").hidden = !a.length; if (!a.length) return;
  annI %= a.length; $("announce").textContent = a[annI];
  $("annPrev").hidden = $("annNext").hidden = a.length < 2;
  clearInterval(annT); if (a.length > 1 && !matchMedia("(prefers-reduced-motion: reduce)").matches) annT = setInterval(() => stepAnn(1), 5000);
}
function stepAnn(d) { const a = (S.shop.announce || []).filter(Boolean); if (!a.length) return; annI = (annI + d + a.length) % a.length; $("announce").textContent = a[annI] }
$("annPrev").onclick = () => { stepAnn(-1); clearInterval(annT) }; $("annNext").onclick = () => { stepAnn(1); clearInterval(annT) };

/* ---------- delivery location ---------- */
const areas = () => (S.shop.areas || []).filter(Boolean);
function renderLocation() {
  const city = S.shop.city || "";
  $("locBtn").hidden = $("locBtn2").hidden = !city;
  $("locTxt").textContent = loc.area ? loc.area : areas().length ? "Select area" : city;
  $("locTxt2").innerHTML = loc.area ? `Delivering to <b>${esc(loc.area)}</b>, ${esc(city)}` : `Delivering across ${esc(city)}${areas().length ? " · <b>Select your area</b>" : ""}`;
  $("locCity").value = city;
  $("locArea").innerHTML = areas().length ? `<option value="">Select your area</option>` + areas().map(a => `<option${a === loc.area ? " selected" : ""}>${esc(a)}</option>`).join("") + `<option value="Other"${loc.area === "Other" ? " selected" : ""}>Other area</option>` : `<option value="">All areas in ${esc(city)}</option>`;
  $("locNote").textContent = city ? `We deliver within ${city}. ${S.shop.delText || ""}` : "";
  fillAreaField();
}
$("locBtn").onclick = $("locBtn2").onclick = () => show($("locModal"));
$("locSave").onclick = () => { loc = {area: $("locArea").value}; save("crum-loc", loc); renderLocation(); show(null); toast(loc.area ? "Delivering to " + loc.area : "Location saved") };

/* ---------- product modal: choose size and quantity ---------- */
const PM = {pid: null, sid: null, qty: 1};
function openProduct(pid, sid, keep) {
  const p = S.products.find(x => x.id === pid); if (!p) return;
  const sizes = p.sizes.filter(s => s.name && s.price > 0);
  const s = sizes.find(x => x.id === sid) || sizes.find(x => sizeAvailable(p, x)) || sizes[0]; if (!s) return;
  if (PM.pid !== pid || PM.sid !== s.id) PM.qty = 1;
  PM.pid = pid; PM.sid = s.id;
  const ok = sizeAvailable(p, s), main = sizePhoto(p, s), hasWa = intl(S.shop.wa).length >= 11;
  const thumbs = sizes.filter(x => sizePhoto(p, x)).map(x => `<button type="button" data-pmsz="${esc(x.id)}" aria-pressed="${x.id === s.id}" aria-label="${esc(x.name)}"><img src="${esc(photoSrc(sizePhoto(p, x)))}" alt=""></button>`).join("");
  const acc = [["About this dessert", p.desc], ["Ingredients", p.ingredients], ["Allergens", p.allergens], ["Storage", p.storage],
    ["Delivery and payment", [S.shop.city ? "We deliver within " + S.shop.city + "." : "", S.shop.delText ? S.shop.delText + "." : "", paymentSummary(S)].filter(Boolean).join(" ").replace(/\.\./g, ".")]]
    .filter(([, t]) => t && String(t).trim());
  $("pmKicker").textContent = p.best ? "Bestseller" : p.isNew ? "New" : "Choose your size";
  $("pmBody").innerHTML = `<div class="gal"><div class="plate">${main ? `<img src="${esc(photoSrc(main))}" alt="${esc(p.name)}, ${esc(s.name)}">` : ""}</div>${thumbs ? `<div class="thumbs">${thumbs}</div>` : ""}</div>
    <div class="pinfo">
      <h2 id="pmName">${esc(p.name)}</h2>
      ${p.line ? `<p class="line">${esc(p.line)}</p>` : ""}
      <fieldset class="szs"><legend>Size</legend>
        ${sizes.map(x => { const xo = sizeAvailable(p, x); return `<label class="sz${xo ? "" : " off"}"><input type="radio" name="pmsz" value="${esc(x.id)}"${x.id === s.id ? " checked" : ""}${xo ? "" : " disabled"}><span><b>${esc(x.name)}</b>${x.serves || !xo ? `<small>${xo ? esc(x.serves) : "Sold out"}</small>` : ""}</span><span class="p">${rs(x.price)}</span></label>` }).join("")}
      </fieldset>
      <div class="buy">
        <div class="qty" role="group" aria-label="Quantity"><button type="button" data-pmq="-1" aria-label="One less">−</button><span id="pmQty">${PM.qty}</span><button type="button" data-pmq="1" aria-label="One more">+</button></div>
        <button class="btn brand" type="button" id="pmAdd"${ok ? "" : " disabled"}>${ok ? `Add to cart · ${rs(s.price * PM.qty)}` : "Sold out"}</button>
      </div>
      ${Object.keys(cart).length ? `<div class="incart"><span>${cart[lineKey(p, s)] ? `${cart[lineKey(p, s)]} × ${esc(s.name)} in your cart` : `${Object.values(cart).reduce((a, b) => a + b, 0)} item(s) in your cart`}</span><button class="btn ghost" type="button" id="pmCart">View cart</button></div>` : ""}
      ${hasWa ? `<a class="btn ghost" href="${esc(waChat(`Hello! I would like to order ${p.name} (${s.name}).`))}" target="_blank" rel="noopener">Ask about this on WhatsApp</a>` : ""}
      ${acc.length ? `<div class="acc">${acc.map(([t, x], i) => `<details${i === 0 ? " open" : ""}><summary>${esc(t)}</summary><p>${esc(x)}</p></details>`).join("")}</div>` : ""}
    </div>`;
  if (!keep) show($("pModal"));
  history.replaceState(null, "", location.pathname + location.search + "#" + encodeURIComponent(p.id) + "/" + encodeURIComponent(s.id));
}
$("pmBody").addEventListener("change", e => { if (e.target.name === "pmsz") openProduct(PM.pid, e.target.value, true) });
$("pmBody").addEventListener("click", e => {
  const t = e.target.closest("[data-pmsz]"); if (t) { openProduct(PM.pid, t.dataset.pmsz, true); return }
  const q = e.target.closest("[data-pmq]");
  if (q) { PM.qty = Math.max(1, Math.min(20, PM.qty + +q.dataset.pmq)); openProduct(PM.pid, PM.sid, true); return }
  if (e.target.closest("#pmCart")) { openCart(); return }
  if (e.target.closest("#pmAdd")) {
    const l = findLine(S, PM.pid + "|" + PM.sid); if (!l || !sizeAvailable(l.p, l.s)) return;
    const k = lineKey(l.p, l.s); cart[k] = Math.min(99, (cart[k] || 0) + PM.qty); persist(); updateLine(k);
    addedToast(`${l.p.name} (${l.s.name}) added to cart`); PM.qty = 1; openProduct(PM.pid, PM.sid, true);
  }
});

/* "Added to cart" message with a View cart button. */
function addedToast(msg) {
  const el = $("toast");
  el.innerHTML = `<span>${esc(msg)}</span><button type="button" class="tbtn" id="toastCart">View cart</button>`;
  el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.hidden = true, 4500);
  $("toastCart").onclick = () => { el.hidden = true; openCart() };
}

/* ---------- global clicks ---------- */
document.addEventListener("click", e => {
  const g = e.target.closest("[data-go]"), a = e.target.closest("[data-add]"), st = e.target.closest("[data-step]"), pv = e.target.closest("[data-pv]"), pol = e.target.closest("[data-policy]"), m = e.target.closest("[data-menu]");
  if (g) { e.preventDefault(); go(g.dataset.go); return }
  if (a) { const k = a.dataset.add, l = findLine(S, k); if (!l || !sizeAvailable(l.p, l.s)) return; cart[k] = (cart[k] || 0) + 1; persist(); updateLine(k, '[data-step][data-d="1"]'); addedToast(`${l.p.name} (${l.s.name}) added to cart`); return }
  if (st) { const k = st.dataset.step, d = +st.dataset.d; cart[k] = Math.min(99, (cart[k] || 0) + d); if (cart[k] <= 0) { delete cart[k]; toast("Removed from cart") } persist(); updateLine(k, cart[k] ? `[data-step][data-d="${d}"]` : "[data-add]"); return }
  if (pv) { openProduct(pv.dataset.pv, pv.dataset.sz); return }
  if (pol) { openPolicy(pol.dataset.policy); return }
  if (m) { const k = m.dataset.menu; if (k === "orders") { show($("ordersDrawer")); return } show(null); $(k).scrollIntoView({behavior: "smooth"}) }
});
$("logo").onclick = e => { e.preventDefault(); scrollTo({top: 0, behavior: "smooth"}) };
const POL_T = {howto: "How to order", payment: "Payments & safety", refund: "Refunds & cancellations", terms: "Terms & conditions", privacy: "Privacy policy"};
function openPolicy(k) {
  $("polTitle").textContent = POL_T[k] || "";
  const P = S.policies || {};
  $("polBody").textContent = k === "payment" ? [paymentSummary(S), "", ...safetyLines(S).map(l => "• " + l)].join("\n")
    : k === "howto" ? stepLines().map((l, i) => `${i + 1}. ${l}`).join("\n")
    : k === "terms" ? [String(P.terms || "").trim(), ...autoTerms(S).map(l => "• " + l)].filter(Boolean).join("\n")
    : P[k] || "Coming soon.";
  show($("polModal"));
}

/* "Pay with confidence": the payment rule and safety promises, written from the shop's settings. */
const TRUST_ICONS = [
  `<path d="M5 9h14l-1.4 10.2a2 2 0 0 1-2 1.8H8.4a2 2 0 0 1-2-1.8z"/><path d="M9 9V7a3 3 0 0 1 6 0v2"/>`,
  `<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v.01M18 15v.01"/>`,
  `<path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/>`,
  `<path d="M4 5h16v10H9l-5 4z"/><path d="M8 10h8"/>`];
function renderTrust() {
  const set = advSetting(S), from = advFrom(S), wa = S.shop.wa;
  const title = ((S.pay.accounts || []).find(a => a && a.active !== false && String(a.number || "").trim() && String(a.title || "").trim()) || {}).title;
  const pts = [];
  if (!set) pts.push(["Cash on delivery", "Pay for your order in cash when it arrives at your door."]);
  else {
    if (from) pts.push([`Cash on delivery under ${rs(from)}`, "Single servings and tubs are paid in cash when they arrive."]);
    pts.push([from ? `${set >= 100 ? "Payment" : set + "% advance"} for larger orders` : `${set >= 100 ? "Payment" : set + "% advance"} at checkout`,
      `${from ? `Orders of ${rs(from)} or more, such as a Dawat Serving, are prepared especially for you. ` : ""}Pay the ${advName(set)} at checkout and upload the screenshot.${set < 100 ? " You pay the rest after you have seen a photo of your ready order." : ""}`]);
    pts.push(["Official accounts only", `Pay only to the accounts shown at checkout${title ? `, in the name of ${String(title).trim()}` : ""}. If we cannot deliver on your date, your payment is refunded in full.`]);
  }
  pts.push(["Confirmed on WhatsApp", `${wa ? `We confirm every order and payment from ${wa}` : "We confirm every order and payment on WhatsApp"}, with your order ID. We never ask for your PIN or OTP.`]);
  $("trust").innerHTML = pts.map(([t, x], i) => `<div class="tr"><span class="ic"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TRUST_ICONS[i % 4]}</svg></span><b>${esc(t)}</b><span>${esc(x)}</span></div>`).join("");
}
function refresh() { renderShop(); renderCart(); if (!$("pModal").hidden && PM.pid) openProduct(PM.pid, PM.sid, true) }
/* One item changed: update only its card's price-and-button row (photos and the other cards are left alone, so
   nothing flickers and the page does not move), then the cart and the open product view. focusSel puts the
   keyboard focus back on the matching control without scrolling. */
function updateLine(k, focusSel) {
  const it = items().find(x => x.key === k);
  if (it) document.querySelectorAll(`#grid .card[data-key="${CSS.escape(k)}"]`).forEach(el => {
    const tmp = document.createElement("div"); tmp.innerHTML = card(it);
    const row = el.querySelector(".row"), nw = tmp.querySelector(".row");
    if (row && nw) row.replaceWith(nw); else el.replaceWith(tmp.firstElementChild);
    const f = focusSel && el.isConnected ? el.querySelector(focusSel) : null; if (f) f.focus({preventScroll: true});
  });
  renderCart(); if (!$("pModal").hidden && PM.pid) openProduct(PM.pid, PM.sid, true);
}

/* ---------- cart → details → order ---------- */
function cleanCart() { for (const k of Object.keys(cart)) { const l = findLine(S, k); if (!l || !sizeAvailable(l.p, l.s) || !(cart[k] > 0)) delete cart[k] } }
function totals() {
  const sub = Object.entries(cart).reduce((t, [k, q]) => { const l = findLine(S, k); return t + (l ? l.s.price * q : 0) }, 0);
  const del = Math.max(0, Math.round(+S.shop.delFee || 0)), tot = sub + del;
  const pct = advanceFor(S, tot);
  const adv = pct >= 100 ? tot : Math.ceil(tot * pct / 100 / 10) * 10;
  return {sub, del, tot, pct, adv, rest: tot - adv};
}
function renderCart() {
  cleanCart(); const keys = Object.keys(cart), n = keys.reduce((t, k) => t + cart[k], 0), t = totals();
  $("cartCount").textContent = n; $("cartCount").hidden = !n;
  $("cartFloat").hidden = !n || STEP === "pay"; document.body.classList.toggle("has-cart", !$("cartFloat").hidden);
  $("cartFloatTxt").innerHTML = `<span>${n} item${n > 1 ? "s" : ""} · ${rs(t.sub)}</span><b>View cart ›</b>`;
  $("checkoutBtn").disabled = !n;
  $("lines").innerHTML = keys.length ? keys.map(k => { const {p, s} = findLine(S, k), ph = sizePhoto(p, s);
    return `<div class="cline"><div class="mini">${ph ? `<img src="${esc(photoSrc(ph))}" alt="">` : ""}</div>
      <div><div class="nm">${esc(p.name)}</div><div class="sub">${esc(s.name)} · ${rs(s.price)} each</div></div>
      <div class="qty"><button type="button" data-cq="${esc(k)}" data-d="-1" aria-label="One less">−</button><span>${cart[k]}</span><button type="button" data-cq="${esc(k)}" data-d="1" aria-label="One more">+</button></div>
      <button class="bin" type="button" data-cdel="${esc(k)}" aria-label="Remove ${esc(p.name)}, ${esc(s.name)} from the cart"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg></button></div>` }).join("")
    : `<div class="empty">Your cart is empty.<br><button class="link" type="button" data-go="all" style="margin-top:8px">Browse the menu</button></div>`;
  $("tSub").textContent = rs(t.sub); $("tDel").textContent = t.del ? rs(t.del) : "Paid to rider"; $("tTot").textContent = rs(t.tot);
  $("tAdvRow").hidden = $("tRestRow").hidden = !t.pct || t.pct >= 100;
  $("tAdvLbl").textContent = `${t.pct}% advance, paid at checkout`; $("tAdv").textContent = rs(t.adv); $("tRest").textContent = rs(t.rest);
  $("tCodRow").hidden = !!t.pct || !keys.length;
  const set = advSetting(S), from = advFrom(S);
  $("tHint").textContent = !keys.length || !set || !from ? "" : t.pct ? `Orders of ${rs(from)} or more are confirmed with a ${advName(set)}.` : `Cash on delivery for orders under ${rs(from)}.`;
  $("tHint").hidden = !$("tHint").textContent;
  renderCheckoutPay(t);
}
$("lines").addEventListener("click", e => {
  const del = e.target.closest("[data-cdel]");
  if (del) { delete cart[del.dataset.cdel]; persist(); updateLine(del.dataset.cdel); toast("Removed from cart"); const f = $("lines").querySelector("button"); if (f) f.focus({preventScroll: true}); return }
  const b = e.target.closest("[data-cq]"); if (!b) return;
  const k = b.dataset.cq, d = +b.dataset.d; cart[k] = Math.min(99, (cart[k] || 0) + d); if (cart[k] <= 0) { delete cart[k]; toast("Removed from cart") }
  persist(); updateLine(k);
  const f = $("lines").querySelector(`[data-cq="${CSS.escape(k)}"][data-d="${d}"]`); if (f) f.focus({preventScroll: true});
});
function fillAreaField() {
  const list = areas(), cur = $("fArea").value || (load("crum-cust", {}).fArea) || loc.area || "";
  $("fArea").hidden = !list.length; $("fAreaTxt").hidden = !!list.length;
  $("fArea").innerHTML = `<option value="">Select your area</option>` + list.map(a => `<option${a === cur ? " selected" : ""}>${esc(a)}</option>`).join("") + `<option value="Other"${cur === "Other" ? " selected" : ""}>Other area (write it in the address)</option>`;
}
{ const d = load("crum-cust", {}); ["fName", "fPhone", "fAddr", "fAreaTxt"].forEach(k => { if (d[k]) $(k).value = d[k] }) }
const areaValue = () => areas().length ? ($("fArea").value === "Other" ? "" : $("fArea").value) : $("fAreaTxt").value.trim();
const payWord = pct => pct >= 100 ? "full payment" : pct + "% advance";
/* ---------- checkout payment: amount, accounts, the customer's screenshot and our promises ----------
   The same flow as Giftoria Atelier: for an order that needs an advance, the customer pays to one of our accounts and
   adds the payment screenshot. It uploads as soon as it is chosen (while they finish the form) and is saved privately
   for the super admin under a draft order ID, so "Place order" can open WhatsApp straight away. Smaller orders are
   cash on delivery. */
let DRAFT_NO = null, PROOF = {state: "none"}, proofSeq = 0;
const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
const draftNo = () => DRAFT_NO || (DRAFT_NO = makeOrderNo(S.shop.name));
const proofNeeded = t => !!(t.pct && payAccounts(S).length);
const ICON_IMG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg>`;
const acctHtml = (acc, pre) => acc.map((a, i) => `<div class="acct"><div style="min-width:0"><div class="k">${esc(a.k)}</div><div class="v" id="${pre}${i}">${esc(a.v)}</div>${a.who ? `<div class="sub">Account title: <b>${esc(a.who)}</b></div>` : ""}</div><button class="sm" type="button" data-copy="${pre}${i}">Copy</button></div>`).join("")
  + (acc.some(a => a.who) ? `<p class="note small">Your payment app shows the account title before you confirm. Check that it matches.</p>` : "");
function renderCheckoutPay(t) {
  const acc = payAccounts(S), part = t.pct > 0 && t.pct < 100;
  $("cpLbl").textContent = !t.pct ? "Cash on delivery" : part ? `Pay ${t.pct}% advance now` : "Pay in full now";
  $("cpAmt").textContent = rs(t.pct ? t.adv : t.tot);
  $("cpNote").innerHTML = !t.pct ? "You pay in cash when your order arrives."
    : (acc.length ? `Send <b>${rs(t.adv)}</b> to any one account below, then upload the screenshot.` : "We will send our payment details on WhatsApp.")
      + (part ? ` The remaining <b>${rs(t.rest)}</b> is paid after we send you a photo of your ready order.` : "");
  $("cpAccts").hidden = !t.pct || !acc.length; $("cpAccts").innerHTML = t.pct ? acctHtml(acc, "cpv") : "";
  $("proofBox").hidden = !proofNeeded(t); if (proofNeeded(t)) renderProof();
  $("cpSafe").innerHTML = safetyLines(S, t.pct > 0).map(l => `<li>${esc(l)}</li>`).join("");
}
function renderProof() {
  const p = PROOF, pic = p.url ? `<img src="${esc(p.url)}" alt="Your payment screenshot">` : `<span class="ph">${ICON_IMG}</span>`;
  if (p.state === "none") { $("proofBox").innerHTML = `<button type="button" class="proof-pick" data-proof="pick">${ICON_IMG}<span><b>Upload payment screenshot</b><small>After paying, take a screenshot of the confirmation and add it here.</small></span></button>`; return }
  if (p.state === "skip") { $("proofBox").innerHTML = `<div class="proof-row"><span class="ph">${ICON_IMG}</span><div class="pr-t"><b>Screenshot on WhatsApp</b><small>Send it in our WhatsApp chat after placing your order.</small></div><button type="button" class="sm" data-proof="pick">Upload now</button></div>`; return }
  const T = {busy: ["Uploading your screenshot…", "Please keep this page open."], done: ["Screenshot uploaded", "We check it before confirming your order."], error: ["Upload failed", p.err || "Check your connection and try again."]}[p.state];
  $("proofBox").innerHTML = `<div class="proof-row ${p.state}">${pic}<div class="pr-t"><b>${T[0]}</b><small>${esc(T[1])}</small></div>${p.state === "busy" ? `<span class="spin" aria-hidden="true"></span>` : `<button type="button" class="sm" data-proof="pick">${p.state === "done" ? "Change" : "Try again"}</button>`}</div>`
    + (p.state === "error" ? `<button type="button" class="link proof-skip" data-proof="skip">Can't upload? Send the screenshot on WhatsApp instead</button>` : "");
}
$("proofBox").addEventListener("click", e => { const b = e.target.closest("[data-proof]"); if (!b) return;
  if (b.dataset.proof === "pick") { $("fProof").value = ""; $("fProof").click() }
  else if (b.dataset.proof === "skip") { proofSeq++; PROOF = {state: "skip"}; renderProof(); setMsg("msg", "") } });
$("fProof").addEventListener("change", () => { const f = $("fProof").files[0]; if (f) uploadProof(f) });
async function uploadProof(file) {
  const id = ++proofSeq, no = draftNo();
  if (PROOF.url) URL.revokeObjectURL(PROOF.url);
  PROOF = {state: "busy"}; renderProof(); setMsg("msg", "");
  try {
    let b = await toJpeg(file, 1600, .82); if (b.size > 900000) b = await toJpeg(file, 1200, .72);
    if (id !== proofSeq) return;
    PROOF.url = URL.createObjectURL(b); renderProof();
    let d;
    if (LOCAL || EMBED) d = {path: `proofs/${no}-preview.jpg`};   /* the local preview never uploads */
    else {
      const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 45000);
      let r; try { r = await fetch(CFG.orderApi.replace(/\/$/, "") + "/proof", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({no, image: await blobB64(b)}), signal: ctl.signal}) } finally { clearTimeout(tm) }
      d = await r.json().catch(() => ({})); if (!r.ok || !d.path) throw new Error(d.error || "upload");
    }
    if (id !== proofSeq) return;
    PROOF = {state: "done", url: PROOF.url, path: d.path, no};
  } catch (e) {
    if (id !== proofSeq) return;
    const m = e && e.message;
    PROOF = {state: "error", url: PROOF.url, err: m === "decode" ? "This file could not be opened. Please choose a JPG or PNG screenshot." : m === "too_large" ? "This image is too large. Please choose the screenshot again." : m === "too_many" ? "Too many uploads. Please wait a few minutes and try again." : "Check your connection and try again."};
  }
  renderProof();
}
document.addEventListener("click", e => { const b = e.target.closest("[data-copy]"); if (!b) return; const el = $(b.dataset.copy);
  navigator.clipboard.writeText(el.textContent).then(() => toast("Account number copied")).catch(() => { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast("Number selected. Copy it manually.") }) });

let ORDER = null;
function buildOrder() {
  const t = totals();
  const its = Object.entries(cart).map(([k, q]) => { const {p, s} = findLine(S, k); return {name: `${p.name} (${s.name})`, qty: q, price: s.price} });
  const no = draftNo();
  return {no, items: its, ...t, proof: PROOF.state === "done" && PROOF.no === no ? PROOF.path : "", proofLater: PROOF.state === "skip", name: $("fName").value.trim(), phone: $("fPhone").value.trim(), city: S.shop.city || "",
    area: areaValue(), addr: $("fAddr").value.trim(), need: $("fDate").value, needTxt: `${fmtDate($("fDate").value)}, ${$("fTime").value}`, note: $("fNote").value.trim()};
}
/* The super admin reads this exact message format back in (Orders → Add an order that came only on WhatsApp). */
function orderText(o) {
  const day = new Date().toLocaleDateString("en-GB", {day: "numeric", month: "short", year: "numeric"});
  const L = [`*${S.shop.name || "Crum"} | New Order*`, `Order ID: *${o.no}*`, `Date: ${day}`, "", "*Items*"];
  o.items.forEach(i => L.push(`• ${i.name} × ${i.qty} — ${rs(i.price * i.qty)}`));
  if (o.del) L.push(`Delivery: ${rs(o.del)}`);
  L.push("", `*Total: ${rs(o.tot)}*`);
  if (o.pct) {
    if (o.pct >= 100) L.push(`${o.proof ? "Paid in full" : "Full payment"}: ${rs(o.adv)}`);
    else L.push(`Advance${o.proof ? " paid" : ""} (${o.pct}%): ${rs(o.adv)}`, `Remaining after the photo: ${rs(o.rest)}`);
    if (o.proof) L.push("Payment screenshot: uploaded with the order"); else if (o.proofLater) L.push("Payment screenshot: I will send it in this chat");
  } else L.push("Payment: cash on delivery");
  L.push("", "*Delivery details*", `Name: ${o.name}`, `Phone: ${o.phone}`, ...(o.city ? [`City: ${o.city}`] : []), ...(o.area ? [`Area: ${o.area}`] : []), `Address: ${o.addr}`);
  if (!o.del) L.push("Delivery fare: paid to the rider");
  if (o.need) L.push(`Needed by: ${o.needTxt || fmtDate(o.need)}`);
  if (o.note) L.push(`Note: ${o.note}`);
  return L.join("\n");
}
const waLink = o => waChat(typeof o === "string" ? o : orderText(o));
const setMsg = (id, t, err) => { $(id).textContent = t; $(id).className = "msg" + (err ? " err" : "") };
function check() {
  if (!Object.keys(cart).length) return "Please add a dessert to your cart.";
  if (!$("fName").value.trim()) return "Please enter your name.";
  if ($("fPhone").value.replace(/\D/g, "").length < 10) return "Please enter a valid phone number, for example 0312 3456789.";
  if (areas().length ? !$("fArea").value : !$("fAreaTxt").value.trim()) return "Please enter your area.";
  if (!$("fAddr").value.trim()) return "Please enter your delivery address.";
  if (!$("fDate").value) return "Please choose the date you need your order.";
  const t = totals();
  if (proofNeeded(t)) {
    if (PROOF.state === "busy") return "Your screenshot is still uploading. Please wait a moment.";
    if (PROOF.state !== "done" && PROOF.state !== "skip") return `Please pay ${rs(t.adv)} and upload the payment screenshot.`;
  }
  return "";
}
function showPay() {
  const o = ORDER, hasWa = intl(S.shop.wa).length >= 11;
  $("cartTitle").textContent = "Order " + o.no;
  $("receipt").innerHTML = `<div class="sub">Order number</div><div class="ono">${esc(o.no)}</div><hr>
    ${o.items.map(i => `<div class="r"><span>${esc(i.name)} × ${i.qty}</span><span>${rs(i.price * i.qty)}</span></div>`).join("")}
    <div class="r"><span>Delivery</span><span>${o.del ? rs(o.del) : "Paid to rider"}</span></div><hr>
    <div class="r" style="font-weight:800"><span>Total</span><span>${rs(o.tot)}</span></div>
    <div class="r sub"><span>${esc(o.name)} · ${esc(o.phone)}</span><span>${esc(o.area || o.city)}</span></div>
    ${o.need ? `<div class="r sub"><span>Needed on</span><span>${esc(o.needTxt)}</span></div>` : ""}`;
  const acc = payAccounts(S), part = o.pct > 0 && o.pct < 100;
  $("payBig").hidden = false;
  $("payBig").innerHTML = !o.pct ? `<div class="sub">Cash on delivery</div><div class="amt">${rs(o.tot)}</div><div class="sub">Nothing to pay now</div>`
    : o.proof ? `<div class="sub">${part ? `${o.pct}% advance paid` : "Paid in full"} · screenshot received</div><div class="amt">${rs(o.adv)}</div>${o.rest > 0 ? `<div class="sub">Remaining ${rs(o.rest)} after we send you a photo of your ready order</div>` : ""}`
    : `<div class="sub">${part ? `Send the ${o.pct}% advance` : "Send the full payment"}</div><div class="amt">${rs(o.adv)}</div>${o.rest > 0 ? `<div class="sub">Remaining ${rs(o.rest)} after the photo of your ready order</div>` : ""}`;
  $("accts").innerHTML = o.pct && !o.proof && acc.length ? acctHtml(acc, "acv") : `<ul class="safe">${safetyLines(S, o.pct > 0).slice(1).map(l => `<li>${esc(l)}</li>`).join("")}</ul>`;
  $("payNote").textContent = !hasWa ? "Your order has been received. We will contact you on your phone number to confirm it."
    : !o.pct ? "Your WhatsApp chat with us has opened with this order. Tap Send there. We will confirm it in the same chat, and you pay when it arrives."
    : o.proof ? "Your WhatsApp chat with us has opened with this order. Tap Send there. We check your payment and confirm your order in the same chat."
    : "Your WhatsApp chat with us has opened with this order. Tap Send there, then pay and send the payment screenshot in the same chat. We confirm your order once we have checked the payment.";
  $("waBtn").hidden = $("copyBtn").hidden = !hasWa; $("waBtn").href = waLink(o);
  setStep("pay"); setMsg("msg2", "");
}
/* "Place order" is a real link: the click handler checks the form, creates the order and points the link at the
   shop's WhatsApp chat before the browser follows it, so one tap places the order and opens the chat. */
$("confirmBtn").addEventListener("click", e => {
  const err = check(); if (err) { e.preventDefault(); setMsg("msg", err, true); if (/screenshot/.test(err)) $("checkoutPay").scrollIntoView({behavior: "smooth", block: "center"}); return } setMsg("msg", "");
  if (EMBED) { e.preventDefault(); toast("This is a preview. Orders cannot be placed here."); return }
  save("crum-cust", {fName: $("fName").value, fPhone: $("fPhone").value, fArea: $("fArea").value, fAreaTxt: $("fAreaTxt").value, fAddr: $("fAddr").value});
  ORDER = buildOrder();
  if (intl(S.shop.wa).length >= 11) $("confirmBtn").href = waLink(ORDER); else e.preventDefault();
  rememberOrder(ORDER); sendOrder(ORDER); showPay();
  DRAFT_NO = null; proofSeq++; PROOF = {state: "none"};
});
$("waBtn").addEventListener("click", () => setMsg("msg2", "Opening WhatsApp. If it does not open, copy the message and send it to " + S.shop.wa + "."));
$("copyBtn").onclick = () => navigator.clipboard.writeText(orderText(ORDER)).then(() => setMsg("msg2", "Message copied. Paste it in a WhatsApp chat with " + S.shop.wa + "."))
  .catch(() => { setMsg("msg2", "Could not copy. Select the text below and copy it.", true);
    let ta = $("fallbackTxt"); if (!ta) { ta = document.createElement("textarea"); ta.id = "fallbackTxt"; ta.rows = 8; $("payStep").appendChild(ta) } ta.value = orderText(ORDER); ta.select() });
/* The drawer has three steps: cart → details (delivery form, place order) → pay (receipt). */
let STEP = "cart";
function setStep(s) {
  STEP = s;
  if (s !== "pay") $("cartTitle").textContent = s === "cart" ? "Your cart" : "Delivery details";
  $("cartStep").hidden = s !== "cart"; $("detailsStep").hidden = s !== "details"; $("payStep").hidden = s !== "pay"; $("cartTotals").hidden = s === "pay";
  $("checkoutBtn").hidden = s !== "cart"; $("confirmBtn").hidden = s !== "details"; $("confirmNote").hidden = s !== "details" || intl(S.shop.wa).length < 11; setMsg("msg", "");
  $("cartFloat").hidden = s === "pay" || !Object.keys(cart).length; document.body.classList.toggle("has-cart", !$("cartFloat").hidden);
}
{ const t = new Date(), p = n => String(n).padStart(2, "0"); $("fDate").min = `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}` }
$("checkoutBtn").onclick = () => { if (!Object.keys(cart).length) { setMsg("msg", "Please add a dessert to your cart.", true); return } setStep("details"); setTimeout(() => $("fName").focus(), 50) };
$("toCartBtn").onclick = () => setStep("cart");
const openCart = () => { if (STEP !== "pay") setStep("cart"); show($("drawer")) };
$("newOrderBtn").onclick = () => { cart = {}; persist(); ORDER = null; DRAFT_NO = null; proofSeq++; PROOF = {state: "none"}; setStep("cart"); refresh(); toast("Cart cleared") };

/* Saves the order for the shop. WhatsApp still opens either way, so a network problem never blocks the customer. */
function sendOrder(o) {
  if (!CFG.orderApi || ["localhost", "127.0.0.1"].includes(location.hostname)) return; /* the local preview never sends real orders */
  try { fetch(CFG.orderApi.replace(/\/$/, "") + "/order", {method: "POST", keepalive: true, headers: {"Content-Type": "application/json"}, body: JSON.stringify({order: o})}).catch(() => {}) } catch (e) {}
}

/* ---------- my orders: orders placed from this device ---------- */
function rememberOrder(o) {
  myOrders = [{no: o.no, at: Date.now(), items: o.items, tot: o.tot, adv: o.adv, pct: o.pct, cart: {...cart}, text: orderText(o)}, ...myOrders.filter(x => x.no !== o.no)].slice(0, 20);
  save("crum-orders", myOrders); renderMyOrders();
}
function renderMyOrders() {
  $("orderCount").textContent = myOrders.length; $("orderCount").hidden = !myOrders.length;
  const hasWa = intl(S.shop.wa).length >= 11;
  $("ordersBody").innerHTML = myOrders.length ? `<p class="note">Orders placed on this device. We confirm every order on WhatsApp.</p>` + myOrders.map((o, i) => `<div class="myo">
      <div class="ohead"><span class="no">${esc(o.no)}</span><span class="sub">${new Date(o.at).toLocaleDateString("en-PK", {day: "numeric", month: "short", year: "numeric"})}</span></div>
      <ul>${(o.items || []).map(it => `<li>${esc(it.name)} × ${it.qty}</li>`).join("")}</ul>
      <div class="sub">Total <b>${rs(o.tot)}</b></div>
      <div class="acts">${hasWa ? `<a class="sm green" href="${esc(waLink(o.text || ""))}" target="_blank" rel="noopener">Send on WhatsApp again</a>` : ""}<button class="sm" type="button" data-reorder="${i}">Order again</button></div>
    </div>`).join("") + `<button class="sm red" type="button" id="clearOrders" style="align-self:start">Clear this list</button>`
    : `<div class="empty">No orders yet. Orders you place on this device appear here.</div>`;
}
$("ordersBody").addEventListener("click", e => {
  const r = e.target.closest("[data-reorder]");
  if (r) { const o = myOrders[+r.dataset.reorder]; if (!o) return; let added = 0;
    for (const [k, q] of Object.entries(o.cart || {})) { const l = findLine(S, k); if (l && sizeAvailable(l.p, l.s)) { cart[k] = (cart[k] || 0) + q; added++ } }
    persist(); setStep("cart"); refresh();
    if (added) { show($("drawer")); toast("Items added to your cart") } else toast("These items are no longer available"); return }
  if (e.target.closest("#clearOrders")) { myOrders = []; save("crum-orders", myOrders); renderMyOrders() }
});

/* ---------- overlays ---------- */
let openPanel = null;
function show(panel) {
  if (openPanel === $("pModal") && panel !== openPanel && location.hash) history.replaceState(null, "", location.pathname + location.search);
  if (openPanel) openPanel.hidden = true; $("filters").classList.remove("open");
  openPanel = panel; $("scrim").hidden = !panel;
  if (panel) { panel.hidden = false; const c = panel.querySelector("[data-close]"); if (c) c.focus({preventScroll: true}) }
}
$("openCart").onclick = openCart; $("cartFloat").onclick = openCart;
$("openOrders").onclick = () => show($("ordersDrawer"));
$("openMenu").onclick = () => show($("menuDrawer"));
$("scrim").onclick = () => show(null);
document.querySelectorAll("[data-close]").forEach(b => b.onclick = () => show(null));
document.addEventListener("keydown", e => { if (e.key === "Escape") show(null) });

/* ---------- colour theme preview (?themes in the address) ---------- */
function renderThemePanel() {
  const on = QS.has("themes") && !EMBED; $("tPanel").hidden = !on; if (!on) return;
  const cur = document.documentElement.dataset.theme, curF = document.documentElement.dataset.fonts;
  $("tpList").innerHTML = THEMES.map(t => `<button class="tp" type="button" data-theme="${t.id}" aria-pressed="${t.id === cur}"><span class="sw">${["brand", "accent", "soft", "ink"].map(k => `<i style="background:${t.c[k]}"></i>`).join("")}</span>${esc(t.name)}${t.id === S.theme ? ` <span class="sub">(live)</span>` : ""}</button>`).join("");
  $("tpFonts").innerHTML = FONTS.map(f => `<button class="tp" type="button" data-font="${f.id}" aria-pressed="${f.id === curF}"><span class="fs" style="font-family:'${esc(f.display)}'">Aa</span>${esc(f.name)}${f.id === S.fonts ? ` <span class="sub">(live)</span>` : ""}</button>`).join("");
  FONTS.forEach(f => loadFonts(f));
}
$("tPanel").addEventListener("click", e => {
  const b = e.target.closest("[data-theme],[data-font]"); if (!b) return;
  const u = new URL(location.href);
  if (b.dataset.theme) { applyTheme(b.dataset.theme); u.searchParams.set("theme", b.dataset.theme) }
  else { applyFonts(b.dataset.font); u.searchParams.set("font", b.dataset.font) }
  history.replaceState(null, "", u); renderThemePanel();
});
$("tpMin").onclick = () => { const m = $("tPanel").classList.toggle("min"); $("tpMin").textContent = m ? "+" : "–"; $("tpMin").setAttribute("aria-label", m ? "Show theme preview" : "Hide theme preview") };
/* The super admin can switch the previewed theme without reloading this page. */
addEventListener("message", e => {
  if (e.origin !== location.origin || !e.data) return;
  if (e.data.type === "crum-theme") applyTheme(e.data.id);
  if (e.data.type === "crum-fonts") applyFonts(e.data.id);
});

/* ---------- search engines: the shop and its menu as schema.org data, built from the published menu ---------- */
function renderSchema() {
  const prices = items().map(it => it.s.price), site = "https://crum.pages.dev/";
  const ld = {"@context": "https://schema.org", "@type": "Bakery", name: S.shop.name || "Crum", url: site, image: site + "images/share.jpg",
    description: S.shop.footAbout || S.shop.tagline || "", servesCuisine: "Desserts", currenciesAccepted: "PKR",
    ...(intl(S.shop.wa) ? {telephone: "+" + intl(S.shop.wa)} : {}),
    ...(S.shop.city ? {areaServed: {"@type": "City", name: S.shop.city}, address: {"@type": "PostalAddress", addressLocality: S.shop.city, addressCountry: "PK"}} : {}),
    ...(prices.length ? {priceRange: `${rs(Math.min(...prices))} – ${rs(Math.max(...prices))}`.replace(/ /g, " ")} : {}),
    hasMenu: {"@type": "Menu", hasMenuSection: S.products.map(p => ({"@type": "MenuSection", name: p.name,
      hasMenuItem: p.sizes.filter(s => s.name && s.price > 0).map(s => ({"@type": "MenuItem", name: `${p.name} (${s.name})`, description: p.line || "",
        ...(sizePhoto(p, s) ? {image: site + sizePhoto(p, s)} : {}),
        offers: {"@type": "Offer", price: s.price, priceCurrency: "PKR", availability: sizeAvailable(p, s) ? "https://schema.org/InStock" : "https://schema.org/OutOfStock"}}))}))}};
  let el = $("ld"); if (!el) { el = document.createElement("script"); el.type = "application/ld+json"; el.id = "ld"; document.head.appendChild(el) }
  el.textContent = JSON.stringify(ld);
}

/* ---------- start: load the published shop data ---------- */
function renderAll() { renderChrome(); renderAnnounce(); renderPills(); renderHero(); renderShop(); renderStrip(); renderWhy(); renderTrust(); renderPromo(); renderSteps(); renderReviews(); renderStory(); renderCart(); renderMyOrders(); renderThemePanel(); renderSchema() }
(async () => {
  try {
    const r = await fetch("data/shop.json?v=" + Date.now(), {cache: "no-store"});
    if (!r.ok) throw new Error(r.status);
    S = normalizeShop(await r.json());
  } catch (e) { $("loader").hidden = true; $("loadErr").hidden = false; return }
  if (!PREVIEW_THEME) applyTheme(S.theme);
  if (!PREVIEW_FONTS) applyFonts(S.fonts);
  $("loader").hidden = true; $("app").hidden = false; $("foot").hidden = false;
  renderAll();
  /* #tiramisu/large opens that dessert and size; #cart opens the cart; any other #id scrolls to that section. */
  const h = decodeURIComponent(location.hash.slice(1)), [pid, sid] = h.split("/");
  if (h === "cart") openCart();
  else if (S.products.some(p => p.id === pid)) openProduct(pid, sid);
  else if (h) { const t = document.getElementById(h); if (t) t.scrollIntoView() }
})();
