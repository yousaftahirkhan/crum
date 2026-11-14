/* The sign-in flow and the Access page end to end (Gmail + password + authenticator code, invite codes for new
   people), with GitHub simulated in memory. Run: node --test test/   (in site-proxy/) */
import test from "node:test";
import assert from "node:assert/strict";
import service from "../lib/auth.js";
import {totpAt, hashPassword} from "../lib/lib.js";

const TOTP = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const codeFor = secret => totpAt(secret, Math.floor(Date.now() / 30000));
const code = () => codeFor(TOTP);

async function testKeyPem() {
  const k = await crypto.subtle.generateKey({name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256"}, true, ["sign", "verify"]);
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", k.privateKey));
  return "-----BEGIN PRIVATE KEY-----\n" + btoa(String.fromCharCode(...der)) + "\n-----END PRIVATE KEY-----";
}

/* A tiny stand-in for the GitHub contents API: one installation and a few files. */
const files = new Map(); let n = 0;
const put = (name, doc) => files.set(name, {sha: "s" + (++n), text: JSON.stringify(doc)});
const doc = name => JSON.parse(files.get(name).text);
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url), json = (b, s = 200) => new Response(JSON.stringify(b), {status: s, headers: {"content-type": "application/json"}});
  if (u.endsWith("/installation")) return json({id: 7});
  if (u.includes("/access_tokens")) return json({token: "ghs_test", expires_at: new Date(Date.now() + 3600e3).toISOString()});
  const m = /\/contents\/(.+)$/.exec(u);
  if (m) {
    const f = files.get(m[1]);
    if (!opts.method || opts.method === "GET") return f ? json({sha: f.sha, content: Buffer.from(f.text).toString("base64")}) : json({message: "Not Found"}, 404);
    if (opts.method === "PUT") {
      const b = JSON.parse(opts.body);
      if ((f && b.sha !== f.sha) || (!f && b.sha)) return json({message: "conflict"}, 409);
      files.set(m[1], {sha: "s" + (++n), text: Buffer.from(b.content, "base64").toString()});
      return json({content: {sha: files.get(m[1]).sha}});
    }
  }
  return json({message: "not found"}, 404);
};

const env = {TOTP_SECRET: TOTP, SESSION_SECRET: "test-session-secret", SESSION_VERSION: "1", GITHUB_CLIENT_ID: "Iv-test", REPO_OWNER: "o", SITE_REPO: "crum", ORDERS_REPO: "crum-orders",
  ADMIN_URL: "https://crum.pages.dev/admin/", SITE_ORIGINS: "https://crum.pages.dev", ALLOWED_EMAILS: "owner@gmail.com"};
let ip = 0;
const call = async (path, body) => {
  const r = await service.fetch(new Request("https://crum.pages.dev" + path, {method: "POST", headers: {"Content-Type": "application/json", "CF-Connecting-IP": "10.0.0." + (++ip)}, body: JSON.stringify(body)}), env);
  return {status: r.status, body: await r.json()};
};
const login = body => call("/login", body);
const access = (session, op, extra) => call("/access", {session, op, ...extra});

test("original owner: no password yet, chooses one together with the code", async () => {
  env.GITHUB_APP_PRIVATE_KEY = await testKeyPem();
  let r = await login({email: "stranger@gmail.com", password: "x"});
  assert.equal(r.body.error, "not_allowed");
  r = await login({email: "owner@gmail.com"});
  assert.deepEqual([r.body.need, r.body.set_password], ["code", true]);
  r = await login({email: "owner@gmail.com", code: await code(), new_password: "12345678"});
  assert.equal(r.body.error, "weak_password");
  r = await login({email: "owner@gmail.com", code: "000000", new_password: "lahore-dessert-1"});
  assert.equal(r.body.error, "bad_code");
  r = await login({email: "Owner@Gmail.com ", code: await code(), new_password: "lahore-dessert-1"});
  assert.equal(r.status, 200); assert.ok(r.body.session); assert.equal(r.body.email, "owner@gmail.com");
  const a = doc("access.json");
  assert.ok(a.sig && a.users[0].pw.startsWith("pbkdf2$") && a.users[0].totp.startsWith("v1."), "signed list, hashed password, sealed authenticator");
  assert.ok(!files.get("access.json").text.includes("lahore-dessert-1") && !files.get("access.json").text.includes(TOTP), "no password or secret in plain text");
  files.delete("access.json");
});

test("owner with a saved password: password first, then the code", async () => {
  put("admins.json", {emails: ["owner@gmail.com"], passwords: {"owner@gmail.com": await hashPassword("lahore-dessert-1")}});
  let r = await login({email: "owner@gmail.com", password: "wrong-password"});
  assert.equal(r.body.error, "bad_password");
  r = await login({email: "owner@gmail.com", password: "lahore-dessert-1"});
  assert.equal(r.body.need, "code"); assert.equal(r.body.session, undefined);
  r = await login({email: "owner@gmail.com", password: "lahore-dessert-1", code: "123456"});
  assert.equal(r.body.error, "bad_code");
  r = await login({email: "owner@gmail.com", password: "lahore-dessert-1", code: await code(), remember: true});
  assert.equal(r.status, 200); assert.ok(r.body.session_exp - Date.now() > 29 * 864e5);
  const t = await call("/token", {session: r.body.session});
  assert.equal(t.body.token, "ghs_test");
});

test("Access page: invite, first sign-in with a QR code, reset, remove, change password", async () => {
  files.delete("access.json");
  put("admins.json", {passwords: {"owner@gmail.com": await hashPassword("lahore-dessert-1")}});
  const owner = (await login({email: "owner@gmail.com", password: "lahore-dessert-1", code: await code()})).body.session;
  let r = await access(owner, "list");
  assert.equal(r.body.managed, false); assert.deepEqual(r.body.users.map(u => u.status), ["active"]);
  assert.equal(JSON.stringify(r.body).includes("pbkdf2"), false, "hashes never leave the service");

  r = await access(owner, "add", {email: "not-an-email"}); assert.equal(r.body.error, "bad_email");
  r = await access(owner, "add", {email: "Sara@Gmail.com", name: "Sara"});
  assert.equal(r.status, 200); assert.match(r.body.invite, /^[a-z2-9]{4}-[a-z2-9]{4}$/);
  const invite = r.body.invite;
  assert.deepEqual(r.body.users.map(u => [u.email, u.status]), [["owner@gmail.com", "active"], ["sara@gmail.com", "pending"]]);
  assert.equal(files.get("access.json").text.includes(invite), false, "only the invite's hash is kept");
  r = await access(owner, "add", {email: "sara@gmail.com"}); assert.equal(r.body.error, "exists");

  // the owner still signs in after the list became managed (shared authenticator kept for them)
  r = await login({email: "owner@gmail.com", password: "lahore-dessert-1", code: await code()});
  assert.equal(r.status, 200);

  // Sara's first sign-in
  r = await login({email: "sara@gmail.com", password: "wrong-code"}); assert.equal(r.body.error, "bad_invite");
  r = await login({email: "sara@gmail.com", password: invite.toUpperCase().replace("-", " ")});
  assert.equal(r.body.setup, true); assert.equal(r.body.set_password, true);
  assert.match(r.body.otpauth, /^otpauth:\/\/totp\/Crum:sara%40gmail\.com\?secret=[A-Z2-7]+&issuer=Crum/);
  const secret = r.body.secret; assert.notEqual(secret, TOTP);
  r = await login({email: "sara@gmail.com", password: invite, code: await codeFor(secret), new_password: "short"});
  assert.equal(r.body.error, "weak_password");
  r = await login({email: "sara@gmail.com", password: invite, code: await code(), new_password: "sara-crum-2026"});
  assert.equal(r.body.error, "bad_code", "the shared authenticator does not work for her");
  r = await login({email: "sara@gmail.com", password: invite, code: await codeFor(secret), new_password: "sara-crum-2026"});
  assert.equal(r.status, 200); assert.equal(r.body.name, "Sara");
  let sara = r.body.session;
  r = await login({email: "sara@gmail.com", password: invite, code: await codeFor(secret)});
  assert.equal(r.body.error, "bad_password", "the invite code works only once");
  r = await login({email: "sara@gmail.com", password: "sara-crum-2026", code: await codeFor(secret)});
  assert.equal(r.status, 200); sara = r.body.session;

  // a tampered list is ignored: back to the original owner only
  const saved = files.get("access.json");
  const forged = doc("access.json"); forged.users.push({email: "attacker@gmail.com", status: "active", sv: 0});
  put("access.json", forged);
  r = await login({email: "attacker@gmail.com", password: "x"}); assert.equal(r.body.error, "not_allowed");
  files.set("access.json", saved);

  // change own password
  r = await access(sara, "password", {password: "nope-nope-1", new_password: "sara-new-2026"}); assert.equal(r.body.error, "bad_password");
  r = await access(sara, "password", {password: "sara-crum-2026", new_password: "sara-new-2026"}); assert.equal(r.body.changed, true);
  r = await login({email: "sara@gmail.com", password: "sara-new-2026", code: await codeFor(secret)}); assert.equal(r.status, 200);
  sara = r.body.session;

  // reset: Sara is signed out, gets a new invite code and a new authenticator
  r = await access(owner, "reset", {email: "sara@gmail.com"});
  assert.match(r.body.invite, /^[a-z2-9]{4}-[a-z2-9]{4}$/); assert.notEqual(r.body.invite, invite);
  assert.equal((await call("/token", {session: sara})).body.error, "session_expired");
  r = await login({email: "sara@gmail.com", password: "sara-new-2026"}); assert.equal(r.body.error, "bad_invite");

  // remove: the last active person cannot be removed
  r = await access(owner, "remove", {email: "owner@gmail.com"}); assert.equal(r.body.error, "last_admin");
  r = await access(owner, "remove", {email: "sara@gmail.com"}); assert.deepEqual(r.body.users.map(u => u.email), ["owner@gmail.com"]);
  r = await login({email: "sara@gmail.com", password: "x"}); assert.equal(r.body.error, "not_allowed");
  assert.equal((await access("forged.session", "list")).body.error, "session_expired");
});
