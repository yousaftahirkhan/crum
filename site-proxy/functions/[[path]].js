/* Crum: serves the shop at https://crum.pages.dev.

   Every request is forwarded to the website on GitHub Pages, so anything published from the super admin appears here
   straight away and there is nothing to redeploy. The super admin is served here too, at /admin/. */

const ORIGIN = "https://yousaftahirkhan.github.io/crum";
const DROP = ["x-github-request-id", "x-fastly-request-id", "x-served-by", "x-cache", "x-cache-hits", "x-timer", "via", "content-length", "access-control-allow-origin"];

/* Keeps copies at Cloudflare's edge near the visitor, so pages load fast: photos and versioned files (?v=) for a day,
   pages for one minute. Shop data and the admin are never cached here, so publishing shows up straight away. */
function edgeCache(url) {
  const p = url.pathname;
  if (p.startsWith("/data/") || p.startsWith("/admin")) return {cacheTtl: 0, cacheEverything: false};
  if (p.startsWith("/images/") || (p.startsWith("/assets/") && url.searchParams.has("v"))) return {cacheTtlByStatus: {"200-299": 86400, "404": 60, "500-599": 0}, cacheEverything: true};
  return {cacheTtlByStatus: {"200-299": 60, "404": 60, "500-599": 0}, cacheEverything: true};
}

export async function onRequest({request}) {
  const url = new URL(request.url);
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", {status: 405, headers: {Allow: "GET, HEAD"}});

  const upstream = await fetch(ORIGIN + url.pathname + url.search, {
    method: request.method,
    headers: {Accept: request.headers.get("Accept") || "*/*", "Accept-Encoding": "gzip, br"},
    redirect: "manual",
    cf: edgeCache(url)
  });

  // GitHub Pages redirects folders without a trailing slash; keep the visitor on this address.
  if (upstream.status >= 300 && upstream.status < 400) {
    const loc = (upstream.headers.get("Location") || "/").replace(/^https?:\/\/yousaftahirkhan\.github\.io\/crum/, "") || "/";
    return Response.redirect(new URL(loc, url).toString(), upstream.status === 301 ? 301 : 302);
  }

  const headers = new Headers(upstream.headers);
  DROP.forEach(h => headers.delete(h));
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return new Response(request.method === "HEAD" ? null : upstream.body, {status: upstream.status, headers});
}
