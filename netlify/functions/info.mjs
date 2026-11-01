// Fetchapple - POST /api/info  { url }  ->  { title, thumbnail, choices[] }
// X/Twitter is handled directly here. Other sites use an optional Cobalt-compatible API.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

function authed(req) {
  const t = process.env.ACCESS_TOKEN;
  if (!t) return true;
  return req.headers.get("x-token") === t;
}

const tweetId = (url) => {
  const m = /(?:twitter\.com|x\.com|fxtwitter\.com|vxtwitter\.com|fixupx\.com)\/[^/]+\/status(?:es)?\/(\d+)/i.exec(url);
  return m ? m[1] : null;
};
export const synToken = (id) =>
  ((Number(id) / 1e15) * Math.PI).toString(6 ** 2).replace(/(0+|\.)/g, "");

const QUALITIES = [
  ["max", "Best available"], ["2160", "2160p (4K)"], ["1440", "1440p"],
  ["1080", "1080p"], ["720", "720p"], ["480", "480p"], ["360", "360p"],
];
const cobaltChoices = () => [
  ...QUALITIES.map(([q, l]) => ({ label: `${l} · video`, mode: "cobalt", quality: q })),
  { label: "Audio only (MP3)", mode: "cobalt", quality: "audio" },
];

async function twitter(id) {
  const r = await fetch(
    `https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=${synToken(id)}`,
    { headers: { "user-agent": UA, accept: "application/json" } }
  );
  if (!r.ok) throw new Error(`X returned ${r.status}. The post may be private, deleted or age-restricted.`);
  const d = await r.json().catch(() => null);
  const media = d?.mediaDetails;
  if (!media?.length) throw new Error("No video or photo found in that post.");

  const choices = [];
  media.forEach((m, i) => {
    const n = i + 1;
    if (m.type === "photo") {
      choices.push({ label: `Photo ${n} · original`, mode: "direct",
                     url: `${m.media_url_https}?name=orig`, filename: `x_${id}_${n}.jpg` });
      return;
    }
    const seen = new Set();
    (m.video_info?.variants || [])
      .filter((v) => v.content_type === "video/mp4")
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))
      .forEach((v) => {
        const res = /\/(\d+)x(\d+)\//.exec(v.url);
        const h = res ? Math.min(+res[1], +res[2]) : null;
        const key = h || v.bitrate;
        if (seen.has(key)) return;
        seen.add(key);
        const kind = m.type === "animated_gif" ? "GIF" : "Video";
        choices.push({
          label: `${kind} ${n} · ${h ? h + "p" : Math.round((v.bitrate || 0) / 1000) + " kbps"} MP4`,
          mode: "direct", url: v.url, filename: `x_${id}_${n}_${h || "hd"}p.mp4`,
        });
      });
  });
  if (!choices.length) throw new Error("No downloadable media found in that post.");

  const text = (d.text || "").replace(/https:\/\/t\.co\/\w+/g, "").trim().slice(0, 90);
  return { title: `${d.user?.name || "X post"}${text ? ": " + text : ""}`,
           thumbnail: media[0].media_url_https, choices };
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  if (!authed(req)) return json({ error: "Wrong or missing access token." }, 401);

  let url;
  try { ({ url } = await req.json()); } catch { return json({ error: "Bad request." }, 400); }
  url = String(url || "").trim();
  let u;
  try { u = new URL(url); if (!/^https?:$/.test(u.protocol)) throw 0; }
  catch { return json({ error: "Please paste a valid http(s) link." }, 400); }

  const cobaltOn = !!process.env.COBALT_API_URL;
  const id = tweetId(url);
  if (id) {
    try { return json(await twitter(id)); }
    catch (e) { if (!cobaltOn) return json({ error: e.message }, 502); }
  }
  if (!cobaltOn)
    return json({ error: "Only X/Twitter links work right now. For YouTube, Instagram, Facebook and Snapchat, set COBALT_API_URL in Netlify (see README)." }, 501);
  return json({ title: u.hostname.replace(/^www\./, ""), thumbnail: null, choices: cobaltChoices() });
};

export const config = { path: "/api/info" };
