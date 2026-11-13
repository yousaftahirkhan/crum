/* Crum: the sign-in and order service at https://crum.pages.dev/api/… (login, token, order, callback).
   It runs here, on the website's own address, so the admin and the shop never call another domain. */
import service from "../../lib/auth.js";

export async function onRequest({request, env}) {
  const url = new URL(request.url);
  url.pathname = url.pathname.replace(/^\/api(?=\/|$)/, "") || "/";
  return service.fetch(new Request(url.toString(), request), env);
}
