/* Crum colour themes: the ONE place where the website's colours are defined.

   The super admin (Theme tab) shows every theme below, previews it on the full website, and publishes the chosen
   theme's id in data/shop.json ("theme"). To add a theme, copy one block, give it a new id and change the colours.

   What each colour is used for:
     bg        page background                 surface    cards, drawers, header
     soft      tinted panels and size pills    softInk    text on soft
     ink       main text                       muted      secondary text
     line      borders                         brand      main buttons, links, badges
     brandInk  text on brand                   brandDeep  brand when pressed / hovered
     accent    price pills and highlights      accentInk  text on accent
     bar       announcement bar                barInk     text on the announcement bar
     foot      footer                          footInk    text in the footer
     blob      soft decorative shapes          logoCloud  logo cloud      logoInk  logo lettering and heart */
"use strict";
const THEMES = [
  {id: "crum", name: "Crum Classic", note: "Blush pink, butter yellow and cocoa, matching the menu cards.", dark: false,
    c: {bg: "#FFF8F5", surface: "#FFFFFF", soft: "#FFE1EC", softInk: "#5A1F14", ink: "#4A1A12", muted: "#85665E", line: "#F1DCD7",
      brand: "#D9126A", brandInk: "#FFFFFF", brandDeep: "#B30D57", accent: "#FFE27A", accentInk: "#4A1A12",
      bar: "#4A1A12", barInk: "#FFE8F0", foot: "#4A1A12", footInk: "#F8E8E2", blob: "#F9B3CF", logoCloud: "#FFDF6B", logoInk: "#D9126A"}},
  {id: "caramel", name: "Lotus Caramel", note: "Warm caramel and biscuit tones with a cream background.", dark: false,
    c: {bg: "#FBF5EE", surface: "#FFFFFF", soft: "#F6E3CF", softInk: "#4B2A14", ink: "#3B2314", muted: "#7E6352", line: "#EBDCCB",
      brand: "#B0561A", brandInk: "#FFFFFF", brandDeep: "#8F4413", accent: "#F4C77E", accentInk: "#3B2314",
      bar: "#3B2314", barInk: "#F6E3CF", foot: "#2E1B10", footInk: "#F1E4D6", blob: "#EBC193", logoCloud: "#F4C77E", logoInk: "#8A3F0E"}},
  {id: "cocoa", name: "Tiramisu Cocoa", note: "Cocoa brown and mascarpone cream. Calm and elegant.", dark: false,
    c: {bg: "#F8F3EC", surface: "#FFFDF9", soft: "#EADBC8", softInk: "#3A2418", ink: "#2E1C13", muted: "#766152", line: "#E2D3C1",
      brand: "#5B3524", brandInk: "#FFF6EC", brandDeep: "#43261A", accent: "#E8D3A9", accentInk: "#2E1C13",
      bar: "#2E1C13", barInk: "#EADBC8", foot: "#241610", footInk: "#EFE3D3", blob: "#D8C1A2", logoCloud: "#E8D3A9", logoInk: "#5B3524"}},
  {id: "strawberry", name: "Strawberry Milk", note: "Soft strawberry pink with deep berry accents.", dark: false,
    c: {bg: "#FFF6F8", surface: "#FFFFFF", soft: "#FFDDE6", softInk: "#6B1630", ink: "#4A1424", muted: "#86636D", line: "#F6D9E1",
      brand: "#CC2D63", brandInk: "#FFFFFF", brandDeep: "#A8204F", accent: "#FFD0DC", accentInk: "#4A1424",
      bar: "#CC2D63", barInk: "#FFFFFF", foot: "#5A1830", footInk: "#FFE5EC", blob: "#FFB8CB", logoCloud: "#FFD0DC", logoInk: "#A8204F"}},
  {id: "pistachio", name: "Pistachio Cream", note: "Fresh pistachio green with a light vanilla background.", dark: false,
    c: {bg: "#F7F8F1", surface: "#FFFFFF", soft: "#E3EBD3", softInk: "#2F3D1F", ink: "#26311B", muted: "#646D5A", line: "#DFE5D2",
      brand: "#557535", brandInk: "#FFFFFF", brandDeep: "#435D29", accent: "#F3E3A6", accentInk: "#26311B",
      bar: "#2F3D1F", barInk: "#E3EBD3", foot: "#232E18", footInk: "#EEF2E4", blob: "#C6D8A6", logoCloud: "#F3E3A6", logoInk: "#557535"}},
  {id: "midnight", name: "Midnight Cocoa", note: "A dark chocolate background with bright pink and yellow.", dark: true,
    c: {bg: "#1E1411", surface: "#2A1D18", soft: "#3A2620", softInk: "#FFD9E6", ink: "#F7EBE6", muted: "#C2AAA1", line: "#4A332B",
      brand: "#FF5C9A", brandInk: "#1E1411", brandDeep: "#FF85B3", accent: "#FFD66B", accentInk: "#2A1D18",
      bar: "#FF5C9A", barInk: "#1E1411", foot: "#140D0B", footInk: "#EADBD5", blob: "#5A2A3A", logoCloud: "#FFD66B", logoInk: "#D10F63"}}
];
const DEFAULT_THEME = "crum";

/* Font styles: a heading font and a text font. The super admin publishes the chosen id as "fonts" in data/shop.json.
   dw and bw are the heading and text weights, ls the heading letter spacing; adj evens out heading sizes for fonts that run small (CSS font-size-adjust).
   Every font here draws a plain "w" (Raleway was dropped because its crossed w spoiled "Dawat"). */
const FONTS = [
  {id: "opensans", name: "Open Sans", note: "Open Sans for headings and text: clear, neutral and professional.", display: "Open Sans", sans: true, dw: 500, body: "Open Sans", bw: 400, adj: "", ls: "-0.01em",
    url: "family=Open+Sans:wght@400;500;600;700"},
  {id: "sans", name: "Clean Sans", note: "Jost for headings and text: modern, light and easy to read.", display: "Jost", sans: true, dw: 500, body: "Jost", bw: 400, adj: "", ls: "-0.01em",
    url: "family=Jost:wght@400;500;600"},
  {id: "poppins", name: "Poppins", note: "Poppins for headings and text: the familiar, friendly sans serif.", display: "Poppins", sans: true, dw: 500, body: "Poppins", bw: 400, adj: "", ls: "-0.015em",
    url: "family=Poppins:wght@400;500;600"},
  {id: "patisserie", name: "Patisserie", note: "Elegant Cormorant Garamond headings with clean Jost text.", display: "Cormorant Garamond", dw: 600, body: "Jost", bw: 400, adj: "0.47",
    url: "family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Jost:wght@400;500;600"},
  {id: "boutique", name: "Boutique", note: "High-contrast Playfair Display with modern DM Sans.", display: "Playfair Display", dw: 500, body: "DM Sans", bw: 400, adj: "",
    url: "family=Playfair+Display:wght@400;500&family=DM+Sans:wght@400;500;600"},
  {id: "classic", name: "Classic", note: "Libre Baskerville with Nunito Sans, close to Olmec.", display: "Libre Baskerville", dw: 400, body: "Nunito Sans", bw: 500, adj: "",
    url: "family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Nunito+Sans:wght@400;500;600;700"},
  {id: "modern", name: "Modern", note: "Soft Fraunces headings with crisp Manrope text.", display: "Fraunces", dw: 400, body: "Manrope", bw: 400, adj: "",
    url: "family=Fraunces:opsz,wght@9..144,400;9..144,500&family=Manrope:wght@400;500;600"}
];
const DEFAULT_FONTS = "poppins";
const fontsById = id => FONTS.find(f => f.id === id) || FONTS[0];
function loadFonts(f, doc = document) {
  const id = "fonts-" + f.id; if (doc.getElementById(id)) return;
  const l = doc.createElement("link"); l.rel = "stylesheet"; l.id = id; l.href = "https://fonts.googleapis.com/css2?" + f.url + "&display=swap"; doc.head.appendChild(l);
}
/* Applies a font style by loading it and setting --display, --body, --dw and --dadj. */
function applyFonts(id, root = document.documentElement) {
  const f = fontsById(id); loadFonts(f, root.ownerDocument);
  root.style.setProperty("--display", f.sans ? `"${f.display}",ui-sans-serif,system-ui,sans-serif` : `"${f.display}",Georgia,"Times New Roman",serif`);
  root.style.setProperty("--dls", f.ls || "0");
  root.style.setProperty("--body", `"${f.body}",ui-sans-serif,system-ui,sans-serif`);
  root.style.setProperty("--dw", f.dw); root.style.setProperty("--bw", f.bw || 400); root.style.setProperty("--dadj", f.adj || "none");
  root.dataset.fonts = f.id;
  return f;
}
const themeById = id => THEMES.find(t => t.id === id) || THEMES.find(t => t.id === DEFAULT_THEME);

/* Applies a theme to a page by setting its CSS colour variables (--bg, --brand, ...). */
function applyTheme(id, root = document.documentElement) {
  const t = themeById(id);
  const kebab = k => k.replace(/[A-Z]/g, m => "-" + m.toLowerCase());
  for (const [k, v] of Object.entries(t.c)) root.style.setProperty("--" + kebab(k), v);
  root.style.colorScheme = t.dark ? "dark" : "light";
  root.dataset.theme = t.id;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && root === document.documentElement) meta.content = t.c.surface;
  return t;
}
