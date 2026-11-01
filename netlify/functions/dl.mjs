// Fetchapple - GET /api/dl?u=<twimg url>&name=<file>  -> streams file as a download
// Only X/Twitter media hosts are allowed, so this can't be used as an open proxy.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const err = (msg, status) =>
  new Response(msg, { status, headers: { "content-type": "text/plain", "cache-control": "no-store" } });

export default async (req) => {
  const q = new URL(req.url).searchParams;
  const t = process.env.ACCESS_TOKEN;
  if (t && (req.headers.get("x-token") || q.get("token")) !== t) return err("Wrong or missing access token.", 401);

  let target;
  try { target = new URL(q.get("u") || ""); } catch { return err("Bad link.", 400); }
  if (target.protocol !== "https:" || !/(^|\.)twimg\.com$/i.test(target.hostname))
    return err("Host not allowed.", 403);

  const upstream = await fetch(target, { headers: { "user-agent": UA } });
  if (!upstream.ok || !upstream.body) return err(`Source returned ${upstream.status}.`, 502);

  const name = (q.get("name") || "download").replace(/[^\w.\-]/g, "_").slice(0, 120);
  const headers = {
    "content-type": upstream.headers.get("content-type") || "application/octet-stream",
    "content-disposition": `attachment; filename="${name}"`,
    "cache-control": "no-store",
  };
  const len = upstream.headers.get("content-length");
  if (len) headers["content-length"] = len;
  return new Response(upstream.body, { headers });
};

export const config = { path: "/api/dl" };
