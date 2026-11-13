/* Where the website sends orders (the sign-in and order service at /api, site-proxy/lib/auth.js). Not secret.
   Leave orderApi empty to take orders on WhatsApp only. */
window.CRUM_CONFIG = {
  orderApi: "https://crum.pages.dev/api"
};
