# Crum

Website for Crum, a dessert kitchen selling Tiramisu and Classic Lotus Crumb in three sizes (Single Serving, Large Tub, Dawat Serving).

The site has two separate parts:

| Part | Address | Who uses it |
|---|---|---|
| Storefront | https://crum.pages.dev/ (also `/` on GitHub Pages) | Customers browse the menu, choose a size, fill the cart and place the order on WhatsApp. |
| Super admin | https://crum.pages.dev/admin/ | The owner manages orders, the menu, the homepage, the colour theme, business details and payments. |

The pages.dev address is a Cloudflare Pages project (`site-proxy/`). It forwards every page to GitHub Pages, so anything
published from the super admin appears there at once, and it runs the sign-in and order service at `/api`
(`site-proxy/lib/auth.js`). The github.io address forwards visitors to crum.pages.dev.
To redeploy it: `cd site-proxy && npx wrangler pages deploy public --project-name crum --branch main`.

## Colour themes

All colours are defined in one place: `assets/themes.js`. It holds six ready-made themes (Crum Classic, Lotus Caramel,
Tiramisu Cocoa, Strawberry Milk, Pistachio Cream, Midnight Cocoa).

- **Choose a theme:** Super admin → *Colour theme*. *Preview* shows the whole website in that theme (computer or phone size);
  *Use this theme*, then *Publish changes*, makes it live. The chosen theme is saved as `"theme"` in `data/shop.json`.
- **Look at every theme on the live website:** open the website address with `?themes` at the end, for example
  `https://crum.pages.dev/?themes`. A small panel lets you switch themes. Only you see it; customers still see the published theme.
- **Add or change a theme:** edit `assets/themes.js`. Each theme is one block of colours; copy a block, give it a new `id` and change the colours.

## How it works

- **Shop content** lives in `data/shop.json` and photos in `images/`. The storefront reads these files; it cannot change them.
- **Menu:** each dessert has its own sizes (name, who it serves, price, optional sale price, photo, sold out). Each size appears
  as its own card on the menu, and sizes with the same name share a filter (for example "Dawat Serving").
- **The super admin** signs in (see below). Selecting *Publish changes* saves one commit to this repository, and the website updates within about a minute.
- **Website orders** are sent by the storefront to the order service (`/api/order`) set in `assets/config.js`,
  and are saved in `orders.json` in the private repository `crum-orders`, so customer names, phone numbers and addresses are never public.
- **Local preview:** run `python -m http.server 8790` in this folder and open http://127.0.0.1:8790/ (website) or
  http://127.0.0.1:8790/admin/ (super admin in preview mode: it reads the local files and never saves).

## Order flow

1. The customer adds items to the cart, enters delivery details and selects *Place order*.
2. WhatsApp opens with the order message ready to send to the shop's number.
3. In the super admin, the order appears under *Orders* (or paste the WhatsApp message under *Add an order that came only on WhatsApp*),
   then moves from *Awaiting payment* to *Delivered*.

## Signing in to the super admin

- **Main sign-in:** Gmail + password + the 6-digit code from the **Crum** entry in an authenticator app, all checked by
  the service at `/api`, which then gives the admin a 1-hour key limited to the two shop repositories. A Gmail that has
  no password yet creates one at its first sign-in (the authenticator code is still required). Passwords are stored only
  as PBKDF2 hashes in `admins.json`.
- **Who can sign in:** Super admin → Business info → **Admin access** (add, remove, reset password). The list is saved as
  `admins.json` in the private `crum-orders` repository. To change Gmail, add the new address first, sign in with it, then remove the old one. If the file is missing,
  the service falls back to its private `ALLOWED_EMAILS` setting.
- **Phone numbers:** the WhatsApp number is under Business info → Contact; payment numbers (JazzCash, Easypaisa, banks)
  are under Payment & delivery, each with an Active / Inactive switch.
- **Other ways:** *Sign in with GitHub*, or a [fine-grained access token](https://github.com/settings/personal-access-tokens/new)
  limited to `crum` and `crum-orders` with Contents set to Read and write.

Settings the super admin needs are in `admin/config.js` (none are secret). To sign everyone out, change `SESSION_VERSION`
in `site-proxy/wrangler.toml` and redeploy the site project.

## Files

```
index.html          storefront
assets/             themes.js (all colours), base.css, common.js, config.js, store.css, store.js, icon.svg
admin/              super admin (index.html, admin.js, admin.css, config.js)
site-proxy/         crum.pages.dev: forwards the website and runs the sign-in and order service (/api)
data/shop.json      shop content
images/             product and site photos
```
