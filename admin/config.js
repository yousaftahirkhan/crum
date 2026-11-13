/* Where the super admin reads and saves data, and how it signs in. None of these values are secret.
   owner             - the GitHub account that hosts the website
   repo              - the public website repository (shop content and photos)
   ordersRepo        - the private repository that stores customer orders
   admins            - GitHub usernames allowed to use "Sign in with GitHub" or an access token
   siteUrl           - the customer website (for the "View website" button)
   authUrl           - the sign-in and order service (site-proxy/lib/auth.js, served at /api)
   githubAppClientId - "Sign in with GitHub" (the Crum Admin GitHub App)
   Until githubAppClientId is filled in, "Sign in with GitHub" stays hidden. */
window.ADMIN_CONFIG = {
  owner: "yousaftahirkhan",
  repo: "crum",
  branch: "main",
  ordersRepo: "crum-orders",
  admins: ["yousaftahirkhan"],
  siteUrl: "https://crum.pages.dev/",
  authUrl: "https://crum.pages.dev/api",
  githubAppClientId: "Iv23liTmsjm4gXzGafsl"
};
