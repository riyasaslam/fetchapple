const $ = id => document.getElementById(id);
const store = {
  get: k => { try { return localStorage.getItem(k) || ""; } catch { return ""; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }
};

/* ---------- IndexedDB (remembers the chosen folder on desktop) ---------- */
const idb = () => new Promise((res, rej) => {
  const r = indexedDB.open("fetchapple", 1);
  r.onupgradeneeded = () => r.result.createObjectStore("kv");
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
async function idbGet(k) {
  try {
    const db = await idb();
    return await new Promise(res => {
      const q = db.transaction("kv").objectStore("kv").get(k);
      q.onsuccess = () => res(q.result || null);
      q.onerror = () => res(null);
    });
  } catch { return null; }
}
async function idbSet(k, v) {
  try {
    const db = await idb();
    await new Promise(res => {
      const t = db.transaction("kv", "readwrite");
      t.objectStore("kv").put(v, k);
      t.oncomplete = res; t.onerror = res;
    });
  } catch {}
}

/* ---------- state ---------- */
const canPickFolder = "showDirectoryPicker" in window;   // desktop Chrome / Edge
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
let dirHandle = null;
let choices = [];

const token = () => store.get("token");
const authHeaders = () => token() ? { "X-Token": token() } : {};
function setMsg(t, kind) {
  $("msg").textContent = t || "";
  $("msg").className = kind === "error" ? "error" : "";
}

/* ---------- settings ---------- */
$("token").value = token();
$("toggleSettings").onclick = () => { $("settings").hidden = !$("settings").hidden; };
$("saveBtn").onclick = () => {
  store.set("token", $("token").value.trim());
  $("settings").hidden = true;
  setMsg("Saved.");
};

/* ---------- paste ---------- */
$("pasteBtn").onclick = async () => {
  try { $("url").value = (await navigator.clipboard.readText()).trim(); }
  catch { setMsg("Clipboard blocked. Long-press the box and choose Paste.", "error"); }
};

/* ---------- save location ---------- */
if (canPickFolder) {
  const o = document.createElement("option");
  o.value = "folder"; o.textContent = "Choose a folder…";
  $("saveMode").appendChild(o);
}
function updateSaveUI() {
  const folder = $("saveMode").value === "folder";
  $("folderRow").hidden = !folder;
  if (folder && dirHandle) $("folderName").textContent = "📁 " + dirHandle.name;
  $("saveHint").textContent = folder
    ? "X/Twitter files are saved straight into this folder."
    : canPickFolder
      ? "Saved to your browser's default Downloads folder."
      : isIOS
        ? "iPhone saves to Files → Downloads. To change it: Settings → Safari → Downloads."
        : "Your browser saves to its Downloads folder. Folder choice works in Chrome/Edge on a computer; on Android, change it in Chrome → Settings → Downloads.";
}
async function pickFolder() {
  try {
    dirHandle = await window.showDirectoryPicker({ id: "fetchapple", mode: "readwrite", startIn: "downloads" });
    await idbSet("dir", dirHandle);
    setMsg("");
  } catch (e) {
    if (e.name !== "AbortError") setMsg("Could not open that folder: " + e.message, "error");
  }
  if (!dirHandle) $("saveMode").value = "downloads";
  updateSaveUI();
}
$("saveMode").onchange = async () => {
  store.set("saveMode", $("saveMode").value);
  if ($("saveMode").value === "folder" && !dirHandle) await pickFolder();
  updateSaveUI();
};
$("changeFolder").onclick = pickFolder;
(async () => {
  if (canPickFolder) {
    dirHandle = await idbGet("dir");
    if (dirHandle && store.get("saveMode") === "folder") $("saveMode").value = "folder";
  }
  updateSaveUI();
})();

/* ---------- API helper ---------- */
async function api(path, body) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body)
  });
  let d = {};
  try { d = await r.json(); } catch {}
  if (r.status === 404) throw new Error("Server functions not found. Redeploy the full Fetchapple folder (see README).");
  if (r.status === 401) { $("settings").hidden = false; }
  if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
  return d;
}

/* ---------- get options ---------- */
function currentChoice() { return choices[+$("quality").value]; }
function updateDirect() {
  const c = currentChoice();
  $("directLink").hidden = !(c && c.mode === "direct");
  if (c && c.mode === "direct") $("directLink").href = c.url;
}
$("quality").onchange = updateDirect;

$("fetchBtn").onclick = async () => {
  const url = $("url").value.trim();
  if (!url) return;
  setMsg(""); $("picker").hidden = true;
  $("fetchBtn").disabled = true; $("fetchBtn").textContent = "Loading...";
  try {
    const d = await api("/api/info", { url });
    choices = d.choices;
    $("title").textContent = d.title;
    if (d.thumbnail) { $("thumb").src = d.thumbnail; $("thumb").hidden = false; }
    else { $("thumb").removeAttribute("src"); $("thumb").hidden = true; }
    $("quality").innerHTML = "";
    choices.forEach((c, i) => {
      const o = document.createElement("option");
      o.value = i; o.textContent = c.label;
      $("quality").appendChild(o);
    });
    $("progress").hidden = true;
    $("preview").hidden = false;
    updateDirect();
  } catch (e) {
    $("preview").hidden = true;
    setMsg(e.message, "error");
  }
  $("fetchBtn").disabled = false; $("fetchBtn").textContent = "Get options";
};

/* ---------- download ---------- */
function filenameFrom(r, fallback) {
  const cd = r.headers.get("Content-Disposition") || "";
  const m = /filename="?([^";]+)"?/i.exec(cd);
  return m ? m[1] : fallback;
}

async function saveToFolder(path, fallbackName) {
  const opts = { mode: "readwrite" };
  if ((await dirHandle.queryPermission(opts)) !== "granted" &&
      (await dirHandle.requestPermission(opts)) !== "granted")
    throw new Error("Folder permission was denied.");

  $("progress").hidden = false; $("bar").className = "indeterminate"; $("bar").style.width = "";
  setMsg("Downloading...");
  const r = await fetch(path, { headers: authHeaders() });
  if (!r.ok) throw new Error((await r.text()) || "Download failed");

  const name = filenameFrom(r, fallbackName);
  const total = +r.headers.get("Content-Length") || 0;
  const w = await (await dirHandle.getFileHandle(name, { create: true })).createWritable();
  const reader = r.body.getReader();
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    await w.write(value);
    loaded += value.length;
    if (total) { $("bar").className = ""; $("bar").style.width = (loaded / total * 100) + "%"; }
  }
  await w.close();
  $("bar").className = ""; $("bar").style.width = "100%";
  setMsg(`Saved "${name}" to ${dirHandle.name}.`);
}

function showPicker(items) {
  const box = $("picker");
  box.innerHTML = "";
  items.forEach(it => {
    const a = document.createElement("a");
    a.href = it.url; a.target = "_blank"; a.rel = "noopener"; a.download = "";
    if (it.thumb) { const im = document.createElement("img"); im.src = it.thumb; im.alt = ""; a.appendChild(im); }
    a.appendChild(document.createTextNode(it.label + " — tap to download"));
    box.appendChild(a);
  });
  box.hidden = false;
  setMsg("This post has several files. Tap the one you want.");
}

$("dlBtn").onclick = async () => {
  const c = currentChoice();
  if (!c) return;
  $("dlBtn").disabled = true;
  try {
    if (c.mode === "direct") {
      const qs = new URLSearchParams({ u: c.url, name: c.filename });
      if ($("saveMode").value === "folder" && dirHandle) {
        await saveToFolder("/api/dl?" + qs, c.filename);
      } else {
        if (token()) qs.set("token", token());
        setMsg("Preparing file... your download starts shortly.");
        window.location = "/api/dl?" + qs;
      }
    } else {
      setMsg("Getting your file...");
      const d = await api("/api/resolve", { url: $("url").value.trim(), quality: c.quality });
      if (d.mode === "picker") showPicker(d.items);
      else { setMsg("Download starting..."); window.location = d.url; }
    }
  } catch (e) {
    setMsg(e.message, "error"); $("progress").hidden = true;
  }
  $("dlBtn").disabled = false;
};
