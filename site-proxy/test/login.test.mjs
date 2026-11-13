/* The sign-in flow end to end (Gmail + password + authenticator code), with GitHub simulated in memory.
   Run: node --test test/   (in site-proxy/) */
import test from "node:test";
import assert from "node:assert/strict";
import service from "../lib/auth.js";
import {totpAt} from "../lib/lib.js";

const TOTP = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const code = () => totpAt(TOTP, Math.floor(Date.now() / 30000));

async function testKeyPem() {
  const k = await crypto.subtle.generateKey({name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256"}, true, ["sign", "verify"]);
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", k.privateKey));
  return "-----BEGIN PRIVATE KEY-----\n" + btoa(String.fromCharCode(...der)) + "\n-----END PRIVATE KEY-----";
}

/* A tiny stand-in for the GitHub API: one installation and an admins.json file. */
let adminsDoc = {emails: ["owner@gmail.com"]}, adminsSha = "s1", writes = 0;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url), json = (b, s = 200) => new Response(JSON.stringify(b), {status: s, headers: {"content-type": "application/json"}});
  if (u.endsWith("/installation")) return json({id: 7});
  if (u.includes("/access_tokens")) return json({token: "ghs_test", expires_at: new Date(Date.now() + 3600e3).toISOString()});
  if (u.endsWith("/contents/admins.json") && (!opts.method || opts.method === "GET"))
    return json({sha: adminsSha, content: Buffer.from(JSON.stringify(adminsDoc)).toString("base64")});
  if (u.endsWith("/contents/admins.json") && opts.method === "PUT") {
    const b = JSON.parse(opts.body); if (b.sha !== adminsSha) return json({message: "conflict"}, 409);
    adminsDoc = JSON.parse(Buffer.from(b.content, "base64").toString()); adminsSha = "s" + (++writes + 1); return json({content: {sha: adminsSha}});
  }
  return json({message: "not found"}, 404);
};

const env = {TOTP_SECRET: TOTP, SESSION_SECRET: "test-session-secret", SESSION_VERSION: "1", GITHUB_CLIENT_ID: "Iv-test", REPO_OWNER: "o", SITE_REPO: "crum", ORDERS_REPO: "crum-orders",
  ADMIN_URL: "https://crum.pages.dev/admin/", SITE_ORIGINS: "https://crum.pages.dev", ALLOWED_EMAILS: ""};
let ip = 0;
const login = async body => {
  const r = await service.fetch(new Request("https://crum.pages.dev/login", {method: "POST", headers: {"Content-Type": "application/json", "CF-Connecting-IP": "10.0.0." + (++ip)}, body: JSON.stringify(body)}), env);
  return {status: r.status, body: await r.json()};
};

test("first sign-in creates the password, later sign-ins need it", async () => {
  env.GITHUB_APP_PRIVATE_KEY = await testKeyPem();
  let r = await login({email: "stranger@gmail.com", password: "x", code: await code()});
  assert.equal(r.body.error, "not_allowed");
  r = await login({email: "owner@gmail.com", code: "000000"});
  assert.equal(r.body.error, "bad_code");
  r = await login({email: "owner@gmail.com", code: await code()});
  assert.equal(r.status, 409); assert.equal(r.body.error, "set_password");
  r = await login({email: "owner@gmail.com", code: await code(), new_password: "12345678"});
  assert.equal(r.body.error, "weak_password");
  r = await login({email: "Owner@Gmail.com ", code: await code(), new_password: "lahore-dessert-1"});
  assert.equal(r.status, 200); assert.ok(r.body.session); assert.equal(r.body.email, "owner@gmail.com");
  assert.match(adminsDoc.passwords["owner@gmail.com"], /^pbkdf2\$/, "only a hash is stored");
  assert.ok(!JSON.stringify(adminsDoc).includes("lahore-dessert-1"), "the password itself is never stored");
  r = await login({email: "owner@gmail.com", password: "wrong-password", code: await code()});
  assert.equal(r.body.error, "bad_password");
  r = await login({email: "owner@gmail.com", password: "lahore-dessert-1", code: await code(), remember: true});
  assert.equal(r.status, 200); assert.ok(r.body.session_exp - Date.now() > 29 * 864e5);
  r = await login({email: "owner@gmail.com", password: "lahore-dessert-1", code: "123456"});
  assert.equal(r.body.error, "bad_code");
});
