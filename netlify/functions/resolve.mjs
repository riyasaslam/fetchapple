// Fetchapple - POST /api/resolve { url, quality } -> link or picker (via Cobalt-compatible API)
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const t = process.env.ACCESS_TOKEN;
  if (t && req.headers.get("x-token") !== t) return json({ error: "Wrong or missing access token." }, 401);

  const api = (process.env.COBALT_API_URL || "").replace(/\/+$/, "");
  if (!api) return json({ error: "COBALT_API_URL is not set in Netlify." }, 501);

  let url, quality;
  try { ({ url, quality } = await req.json()); } catch { return json({ error: "Bad request." }, 400); }
  try { new URL(url); } catch { return json({ error: "Invalid link." }, 400); }

  const audio = quality === "audio";
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  if (process.env.COBALT_API_KEY) headers.Authorization = `Api-Key ${process.env.COBALT_API_KEY}`;

  let data;
  try {
    const r = await fetch(`${api}/`, {
      method: "POST", headers,
      body: JSON.stringify({
        url,
        videoQuality: audio ? "1080" : String(quality || "max"),
        downloadMode: audio ? "audio" : "auto",
        audioFormat: "mp3",
        filenameStyle: "basic",
      }),
    });
    data = await r.json();
  } catch {
    return json({ error: "Could not reach the downloader API." }, 502);
  }

  if (data.status === "tunnel" || data.status === "redirect")
    return json({ mode: "link", url: data.url, filename: data.filename });
  if (data.status === "picker")
    return json({ mode: "picker",
      items: (data.picker || []).map((p, i) => ({ type: p.type, url: p.url, thumb: p.thumb, label: `${p.type === "photo" ? "Photo" : "Video"} ${i + 1}` })),
      audio: data.audio || null });
  const code = data.error?.code || "unknown error";
  return json({ error: `Downloader said: ${code}` }, 502);
};

export const config = { path: "/api/resolve" };
