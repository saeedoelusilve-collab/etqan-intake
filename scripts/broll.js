const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const OUT = process.env.REEL_OUT || path.join(ROOT, "reel_out");
const PEXELS = process.env.PEXELS_API_KEY || "";
const PIXABAY = process.env.PIXABAY_API_KEY || "";
const GKEY = process.env.GEMINI_API_KEY || "";
let VISION = ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-flash-lite-latest", "gemini-3.1-flash-lite", "gemini-flash-latest"];
try { const c = JSON.parse(fs.readFileSync(path.join(ROOT, "social", "models.json"), "utf8")); if (c.last_ok) VISION = [c.last_ok].concat(VISION.filter(x => x !== c.last_ok)); } catch (e) {}
const T0 = Date.now();
const DEADV = new Set();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const USED = path.join(ROOT, "social", "broll_used.json");
const log = m => console.log("[اللقطات] " + m);

const TRADE = {
  "سباكة": { q: ["plumber", "faucet", "plumbing", "water leak", "bathroom sink", "pipe wrench"], k: ["plumb", "faucet", "tap", "pipe", "sink", "bathroom", "leak", "drain", "toilet", "shower", "wrench"] },
  "كهرباء": { q: ["electrician", "electrical panel", "electric socket", "wiring", "light bulb", "circuit breaker"], k: ["electric", "wire", "wiring", "socket", "outlet", "cable", "switch", "panel", "breaker", "voltage", "bulb", "lamp"] },
  "تكييف": { q: ["air conditioner", "air conditioning", "hvac", "technician repair", "thermostat", "split air conditioner"], k: ["air condition", "conditioner", "conditioning", "hvac", "ac unit", "cooling", "thermostat", "ventilation", "technician", "split"] },
  "أجهزة كهربائية": { q: ["washing machine", "refrigerator", "appliance repair", "dishwasher", "washing machine repair", "fridge"], k: ["washing", "washer", "machine", "fridge", "refrigerator", "appliance", "dishwasher", "oven", "microwave", "laundry", "kitchen"] },
  "نجارة": { q: ["carpenter", "woodworking", "door handle", "wooden door", "kitchen cabinet", "furniture assembly"], k: ["carpent", "wood", "door", "cabinet", "furniture", "drill", "saw", "plank", "hinge", "handle", "wardrobe"] },
  "تبليط": { q: ["tiles", "tiling", "ceramic tiles", "floor tiles", "bathroom tiles", "tile installation"], k: ["tile", "tiling", "ceramic", "floor", "marble", "grout", "porcelain", "bathroom"] },
  "دهان": { q: ["painting wall", "paint roller", "house painting", "painter", "wall paint", "interior painting"], k: ["paint", "painter", "roller", "brush", "wall", "color", "colour", "decorat"] },
  "جبس بورد": { q: ["ceiling", "drywall", "plasterboard", "interior renovation", "ceiling lights", "living room interior"], k: ["ceiling", "drywall", "plaster", "gypsum", "interior", "renovat", "room", "lighting"] },
  "سمنت بورد": { q: ["construction worker", "renovation", "building construction", "facade", "construction site", "builder"], k: ["construct", "renovat", "build", "worker", "facade", "site", "cement", "concrete"] },
  "حدادة": { q: ["welding", "welder", "metal work", "steel", "metal gate", "grinder sparks"], k: ["weld", "metal", "steel", "iron", "spark", "grinder", "gate", "fabricat"] },
  "بناء ولياسة": { q: ["construction site", "bricklayer", "plastering", "cement", "building construction", "construction worker"], k: ["construct", "brick", "plaster", "cement", "concrete", "build", "mason", "worker", "site"] }
};
const GENERIC = { q: ["home repair", "handyman", "house renovation", "repairman", "tools"], k: ["repair", "handyman", "renovat", "tool", "maintenance", "screwdriver", "drill"] };
const BLOCK = ["sea", "ocean", "beach", "bird", "animal", "sunset", "sunrise", "mountain", "forest", "flower", "landscape", "sky", "cloud", "lake", "river", "nature", "wildlife", "dog", "cat", "fish", "waterfall", "tree", "leaf", "plant", "abstract", "particles", "background", "galaxy", "space", "fantasy", "christmas", "rain", "snow", "fire", "prayer", "pray", "mosque", "church", "temple", "religio", "worship", "synagogue", "jew", "christian", "cross", "bible", "woman", "women", "girl", "lady", "female", "model", "fashion", "beauty", "bikini", "beer", "wine", "alcohol", "smok", "party", "port", "ship", "harbor", "harbour", "container", "skyline", "traffic", "city", "flag", "dance", "wedding", "kiss", "couple", "domino", "supermarket", "grocery", "vase", "roof", "statue", "number", "fruit", "eiffel", "bicycle", "textile", "shingle", "legs", "feet", "walking", "shopping", "retail", "antique", "museum", "church"];

const FOOD = ["food", "meat", "cookie", "pizza", "cake", "baking", "bake", "cooking", "cook ", "dough", "macaron", "ribs", "chef", "bread", "dish of", "plate of", "meal"];

function relevant(tags, keys, q) {
  const t = " " + String(tags || "").toLowerCase() + " ";
  const ql = q.toLowerCase();
  if (BLOCK.some(b => t.includes(" " + b) && !ql.includes(b))) return false;
  return keys.some(k => t.includes(k));
}

function readJSON(p, d) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return d; } }

async function pexels(q) {
  const qs = "?per_page=20&orientation=portrait&size=medium&query=" + encodeURIComponent(q);
  let r = await fetch("https://api.pexels.com/videos/search" + qs, { headers: { Authorization: PEXELS } });
  if (r.status === 404) r = await fetch("https://api.pexels.com/v1/videos/search" + qs, { headers: { Authorization: PEXELS } });
  if (!r.ok) throw new Error("pexels " + r.status);
  const j = await r.json();
  return (j.videos || []).map(v => {
    const files = (v.video_files || []).filter(f => f.file_type === "video/mp4" && f.height >= f.width && f.height >= 1280)
      .sort((a, b) => Math.abs(a.height - 1920) - Math.abs(b.height - 1920));
    const tags = String(v.url || "").split("/").filter(Boolean).pop() || "";
    return files.length && v.duration >= 3 ? { id: "px" + v.id, url: files[0].link, thumb: v.image || "", credit: (v.user && v.user.name) || "Pexels", src: "Pexels", tags: tags.replace(/-/g, " "), portrait: true } : null;
  }).filter(Boolean);
}

async function pixabay(q) {
  const url = "https://pixabay.com/api/videos/?per_page=50&safesearch=true&video_type=film&order=popular&key=" + PIXABAY + "&q=" + encodeURIComponent(q);
  const r = await fetch(url);
  if (!r.ok) throw new Error("pixabay " + r.status);
  const j = await r.json();
  return (j.hits || []).map(h => {
    const vs = ["large", "medium"].map(k => h.videos && h.videos[k]).filter(v => v && v.url);
    if (!vs.length || h.duration < 3) return null;
    const v = vs[0];
    const thumb = (h.videos.small && h.videos.small.thumbnail) || (h.videos.medium && h.videos.medium.thumbnail) || v.thumbnail || "";
    return { id: "pb" + h.id, url: v.url, thumb: thumb, credit: h.user || "Pixabay", src: "Pixabay", tags: h.tags || "", portrait: v.height > v.width, sharp: v.height >= 1400 || (v.height > v.width && v.height >= 1280) };
  }).filter(Boolean);
}

async function pixabayPhotos(q) {
  if (!PIXABAY) return [];
  const url = "https://pixabay.com/api/?image_type=photo&orientation=vertical&safesearch=true&per_page=40&order=popular&key=" + PIXABAY + "&q=" + encodeURIComponent(q);
  const r = await fetch(url);
  if (!r.ok) throw new Error("pixabay photos " + r.status);
  const j = await r.json();
  return (j.hits || []).filter(h => h.largeImageURL && h.imageHeight >= 1200).map(h => ({
    id: "pp" + h.id, url: h.largeImageURL, thumb: h.webformatURL, credit: h.user || "Pixabay", src: "Pixabay (صورة)", tags: h.tags || "", kind: "photo"
  }));
}

async function search(q) {
  let out = [];
  if (PEXELS) { try { out = out.concat(await pexels(q)); } catch (e) { log(e.message); } }
  if (PIXABAY && out.length < 3) { try { out = out.concat(await pixabay(q)); } catch (e) { log(e.message); } }
  return out;
}

async function download(url, file, min) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("download " + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < (min || 50000)) throw new Error("ملف صغير");
  fs.writeFileSync(file, buf);
}

async function b64(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error("thumb " + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  return { data: buf.toString("base64"), mime: r.headers.get("content-type") || "image/jpeg" };
}

async function judge(scene, trade, cands, minScore) {
  const MIN = minScore || 6;
  if (!GKEY) return null;
  const imgs = [];
  for (const c of cands) {
    if (!c.thumb) continue;
    try { imgs.push({ c: c, img: await b64(c.thumb) }); } catch (e) {}
  }
  if (!imgs.length) return null;
  log("الحَكَم يفحص " + imgs.length + " صورة");
  const prompt = "You are a video editor choosing stock footage for a Saudi home-maintenance ad (Medina, conservative family audience).\n" +
    "Trade: " + trade + ". Scene text (Arabic): " + (scene.text || "") + ". Ideal shot: " + (scene.visual || scene.broll || trade) + ".\n" +
    "Score each numbered image 0-10: 9-10 = shows the ideal shot; 7-8 = clearly shows this trade's work, tools, materials or results (good as background for this scene); 5-6 = related home or maintenance context; 1-4 = weak link.\n" +
    "Give 0 if ANY of these: unrelated subject; women or girls (even partially visible: legs, hands with nail polish, long hair); people walking or body parts as the main subject; decorative patterns, house numbers, art tiles or souvenirs; a person's face as the main subject; religious buildings, symbols, rituals or gatherings of any religion; alcohol or smoking; nudity or swimwear; visible text, logos or watermarks; nature, landscape, sea, sky or animals; cartoon, 3D render or abstract graphics; flags.\n" +
    "First describe what each image actually shows in 3-6 plain English words, then score it.\n" +
    'Return JSON only: {"items":[{"desc":"what the image shows","score":0}]} with one item per image in order';
  const parts = [{ text: prompt }];
  imgs.forEach((x, i) => { parts.push({ text: "Image " + i + ":" }); parts.push({ inline_data: { mime_type: x.img.mime, data: x.img.data } }); });
  for (const m of VISION) {
    if (DEADV.has(m)) continue;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + m + ":generateContent?key=" + GKEY, {
          method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(90000),
          body: JSON.stringify({ contents: [{ parts: parts }], generationConfig: { temperature: 0.1, responseMimeType: "application/json" } })
        });
        if (r.status === 503 && attempt === 1) { await sleep(3000); continue; }
        if (!r.ok) { log("الحَكَم " + m + " ← " + r.status); if (r.status !== 503) DEADV.add(m); break; }
        const j = await r.json();
        const t = ((j.candidates || [])[0] || {}).content;
        const txt = ((t && t.parts) || []).filter(x => x.text && !x.thought).map(x => x.text).join("");
        const o = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
        const tk = (TRADE[trade] || (trade === "كل الخدمات" ? { k: [].concat(...Object.values(TRADE).map(t => t.k)) } : GENERIC)).k.concat(GENERIC.k);
        const items = Array.isArray(o.items) ? o.items : (o.scores || []).map(v => ({ score: v, desc: "" }));
        const sc = items.map(it => {
          const d = String(it.desc || "").toLowerCase();
          const WEAK = ["floor", "bathroom", "room", "interior", "wall", "kitchen", "home", "house", "site", "worker", "build", "lighting", "color", "colour", "handle", "tool", "repair", "maintenance"];
          const strong = tk.filter(k => !WEAK.includes(k));
          const BAD = BLOCK.concat(FOOD, ["supermarket", "shop", "store", "market", "car ", "street", "office", "computer", "laptop", "phone", "motherboard", "circuit board", "cpu"]);
          const okDesc = !it.desc || ((strong.length ? strong : tk).some(k => d.includes(k)) && !BAD.some(b => (" " + d).includes(" " + b)));
          return okDesc ? Number(it.score) || 0 : 0;
        });
        if (items.length) log("الحَكَم رأى: " + items.slice(0, 10).map((it, i) => i + ")" + String(it.desc || "").slice(0, 28) + "=" + sc[i]).join(" | "));
        let best = -1, bs = -1;
        sc.forEach((v, i) => { if (v > bs) { bs = v; best = i; } });
        const all = imgs.map((x, i) => ({ c: x.c, score: sc[i] || 0, desc: String((items[i] || {}).desc || "") }));
        if (best < 0 || bs < MIN || !imgs[best]) return { pick: null, scores: sc, all: all };
        return { pick: imgs[best].c, score: bs, scores: sc, all: all };
      } catch (e) { log("الحَكَم " + m + ": " + e.message); DEADV.add(m); break; }
    }
  }
  return null;
}

const MONTAGE_DIR = path.join(ROOT, "social", "montage");
const MONTAGE = [
  ["plumbing", "سباكة", ["plumber", "faucet repair", "bathroom sink"]],
  ["electrical", "كهرباء", ["electrician", "electrical panel", "socket"]],
  ["hvac", "تكييف", ["air conditioner", "hvac technician", "air conditioning"]],
  ["appliances", "أجهزة كهربائية", ["washing machine", "appliance repair", "refrigerator"]],
  ["carpentry", "نجارة", ["carpenter", "woodworking", "wooden door"]],
  ["tiling", "تبليط", ["tiling", "ceramic tiles", "floor tiles"]],
  ["painting", "دهان", ["paint roller", "painting wall", "painter"]],
  ["gypsum", "جبس بورد", ["ceiling", "drywall", "plasterboard"]],
  ["cementboard", "سمنت بورد", ["construction worker", "renovation", "facade"]],
  ["blacksmith", "حدادة", ["welding", "welder", "metal work"]],
  ["building", "بناء ولياسة", ["bricklayer", "construction site", "plastering"]]
];

async function montageLibrary() {
  if (!PIXABAY) return;
  fs.mkdirSync(MONTAGE_DIR, { recursive: true });
  const metaP = path.join(MONTAGE_DIR, "meta.json");
  const meta = readJSON(metaP, {});
  const now = Date.now();
  const M0 = Date.now();
  let fresh = 0;
  for (const [slug, trade, qs] of MONTAGE) {
    const f = path.join(MONTAGE_DIR, slug + ".jpg");
    if (fs.existsSync(f) && meta[slug] && now - meta[slug].t < 21 * 86400000) continue;
    if (Date.now() - M0 > 6 * 60000) { log("مكتبة الخدمات: توقفنا لضيق الوقت، نكمل غداً"); break; }
    const tr = TRADE[trade] || GENERIC;
    const cands = [];
    for (const q of qs.slice(0, 2)) {
      try { (await pixabayPhotos(q)).filter(v => relevant(v.tags, tr.k, q)).slice(0, 6).forEach(v => { if (!cands.some(c => c.id === v.id)) cands.push(Object.assign({ q: q }, v)); }); } catch (e) { log(e.message); }
    }
    if (!cands.length) { log("مكتبة الخدمات: " + trade + " — لا مرشحين"); continue; }
    const j = await judge({ text: trade, visual: "a clean, professional photo that clearly represents " + qs[0] + " work in a home" }, trade, cands.slice(0, 10));
    const pick = j ? j.pick : null;
    if (!pick) { log("مكتبة الخدمات: " + trade + " — لا صورة مناسبة اليوم"); await sleep(1200); continue; }
    try {
      await download(pick.thumb || pick.url, f, 8000);
      meta[slug] = { t: now, id: pick.id, credit: pick.credit, tags: pick.tags };
      fresh++;
      log("مكتبة الخدمات: " + trade + " ✓ (" + j.score + "/10)");
    } catch (e) { log(e.message); }
    await sleep(1200);
  }
  fs.writeFileSync(metaP, JSON.stringify(meta, null, 1));
  log("مكتبة الخدمات: " + Object.keys(meta).length + "/11 جاهزة" + (fresh ? " (أُضيفت " + fresh + " اليوم)" : ""));
}


// ===== صور مولّدة تطابق القصة (Cloudflare Workers AI — مجاني 10,000 وحدة يومياً) =====
const CF_ID = process.env.CF_ACCOUNT_ID || "", CF_TOKEN = process.env.CF_API_TOKEN || "";
const CF_MODELS = ["@cf/black-forest-labs/flux-2-klein-4b", "@cf/black-forest-labs/flux-1-schnell"];
const CF_DEAD = new Set();
const STYLE = ". Photorealistic documentary photo shot on a smartphone, natural light, realistic textures, Saudi Arabian home in Medina, vertical composition. No text, no letters, no logos, no watermark, no women, no faces, no religious symbols.";

async function cfImage(prompt, seed) {
  if (!CF_ID || !CF_TOKEN) return null;
  for (const m of CF_MODELS) {
    if (CF_DEAD.has(m)) continue;
    try {
      const url = "https://api.cloudflare.com/client/v4/accounts/" + CF_ID + "/ai/run/" + m;
      let r;
      if (m.includes("flux-2")) {
        const fd = new FormData();
        fd.append("prompt", prompt + STYLE); fd.append("width", "864"); fd.append("height", "1536"); fd.append("seed", String(seed));
        r = await fetch(url, { method: "POST", headers: { Authorization: "Bearer " + CF_TOKEN }, body: fd, signal: AbortSignal.timeout(120000) });
      } else {
        r = await fetch(url, { method: "POST", headers: { Authorization: "Bearer " + CF_TOKEN, "Content-Type": "application/json" }, body: JSON.stringify({ prompt: prompt + STYLE, steps: 8, seed: seed }), signal: AbortSignal.timeout(120000) });
      }
      if (!r.ok) { const t = (await r.text()).slice(0, 160); log("المولّد " + m.split("/").pop() + " ← " + r.status + " " + t); if (r.status !== 503 && r.status !== 500) CF_DEAD.add(m); continue; }
      const ct = r.headers.get("content-type") || "";
      let buf;
      if (ct.includes("json")) { const j = await r.json(); const b = (j.result && (j.result.image || j.result.images && j.result.images[0])) || j.image; if (!b) { log("المولّد: لا صورة في الرد"); continue; } buf = Buffer.from(b, "base64"); }
      else buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 15000) continue;
      return { buf: buf, model: m.split("/").pop(), square: !m.includes("flux-2") };
    } catch (e) { log("المولّد " + m.split("/").pop() + ": " + e.message); }
  }
  return null;
}

async function judgeGen(scene, prompt, bufs) {
  if (!GKEY) return null;
  const p = "You are a strict creative director for a Saudi home-maintenance ad (conservative family audience). Intended shot: " + prompt + ". Scene line (Arabic): " + (scene.text || "") + ".\n" +
    "For each numbered image: describe it in 3-6 words, then score 0-10 how well it shows the intended shot AS A BELIEVABLE REAL PHOTO. Give 0 if: any woman or girl, a visible face, any text/letters/logo, distorted or extra fingers, melted or impossible objects, cartoon or obvious CGI look, religious symbols, alcohol.\n" +
    'Return JSON only: {"items":[{"desc":"...","score":0}]}';
  const parts = [{ text: p }];
  bufs.forEach((b, i) => { parts.push({ text: "Image " + i + ":" }); parts.push({ inline_data: { mime_type: "image/jpeg", data: b.toString("base64") } }); });
  for (const m of VISION) {
    if (DEADV.has(m)) continue;
    try {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + m + ":generateContent?key=" + GKEY, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(90000),
        body: JSON.stringify({ contents: [{ parts: parts }], generationConfig: { temperature: 0.1, responseMimeType: "application/json" } })
      });
      if (!r.ok) { log("حَكَم الصور " + m + " ← " + r.status); if (r.status !== 503) DEADV.add(m); continue; }
      const j = await r.json();
      const t = ((j.candidates || [])[0] || {}).content;
      const txt = ((t && t.parts) || []).filter(x => x.text && !x.thought).map(x => x.text).join("");
      const o = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
      return (o.items || []).map(it => ({ desc: String(it.desc || ""), score: BLOCK.some(b => (" " + String(it.desc).toLowerCase()).includes(" " + b) && !prompt.toLowerCase().includes(b)) ? 0 : Number(it.score) || 0 }));
    } catch (e) { log("حَكَم الصور " + m + ": " + e.message); DEADV.add(m); }
  }
  return null;
}

async function generated(scene, i, seed) {
  const prompt = String(scene.gen || scene.visual || "").trim();
  if (!prompt || !CF_ID || !CF_TOKEN) return null;
  const outs = [];
  for (let k = 0; k < 2; k++) { const g = await cfImage(prompt, seed * 10 + i * 3 + k); if (g) outs.push(g); }
  if (!outs.length) return null;
  const sc = await judgeGen(scene, prompt, outs.map(o => o.buf));
  if (!sc) { log("مشهد " + (i + 1) + ": حَكَم الصور غير متاح — لا نستخدم صورة غير مفحوصة"); return null; }
  let best = -1, bs = -1;
  sc.forEach((x, k) => { if (k < outs.length && x.score > bs) { bs = x.score; best = k; } });
  log("مشهد " + (i + 1) + ": صور مولّدة (" + sc.map(x => x.score + ":" + x.desc.slice(0, 30)).join(" | ") + ")");
  if (best < 0 || bs < 7) return null;
  const raw = path.join(OUT, "gen" + i + ".img");
  fs.writeFileSync(raw, outs[best].buf);
  try {
    require("child_process").execFileSync("ffmpeg", ["-v", "error", "-y", "-i", raw, "-vf", "scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920,unsharp=5:5:0.4", "-q:v", "2", path.join(OUT, "bg" + i + ".jpg")]);
  } catch (e) { log("ffmpeg للصورة المولّدة: " + e.message); return null; }
  return { id: "gen-" + i, q: "generated", credit: "مولّدة (" + outs[best].model + ")", src: "صورة مولّدة " + bs + "/10", tags: sc[best].desc };
}

// ===== مكتبة اللقطات المعتمدة: كل لقطة نالت 7+ من الحَكَم تُحفظ وتُستخدم لاحقاً بلا بحث =====
const LIB = path.join(ROOT, "social", "footage.json");
const SCENE_CAP = 12 * 60000, HARVEST_CAP = 16 * 60000, MONTAGE_CAP = 19 * 60000;
const SLUGS = { "سباكة": "plumbing", "كهرباء": "electrical", "تكييف": "hvac", "أجهزة كهربائية": "appliances", "نجارة": "carpentry", "تبليط": "tiling", "دهان": "painting", "جبس بورد": "gypsum", "سمنت بورد": "cementboard", "حدادة": "blacksmith", "بناء ولياسة": "building" };
const ALL = { q: Object.values(TRADE).map(t => t.q[0]), k: [].concat(...Object.values(TRADE).map(t => t.k)) };
const tinfo = t => TRADE[t] || (t === "كل الخدمات" ? ALL : GENERIC);
const today = new Date().toISOString().slice(0, 10);

function libAdd(lib, trade, j) {
  let n = 0;
  (j && j.all || []).filter(a => a.score >= 7 && a.c && a.c.id).forEach(a => {
    if (lib.items.some(x => x.id === a.c.id)) return;
    lib.items.push({ id: a.c.id, kind: a.c.kind === "photo" ? "photo" : "video", trade: trade, desc: a.desc.slice(0, 60), score: a.score, url: a.c.url, thumb: a.c.thumb, credit: a.c.credit, src: a.c.src, tags: a.c.tags, added: today });
    n++;
  });
  return n;
}

async function freshUrl(it) {
  const m = /^(pb|pp)(\d+)$/.exec(it.id);
  if (!m || !PIXABAY) return it.url;
  try {
    const u = (m[1] === "pb" ? "https://pixabay.com/api/videos/?key=" : "https://pixabay.com/api/?key=") + PIXABAY + "&id=" + m[2];
    const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) return it.url;
    const h = ((await r.json()).hits || [])[0];
    if (!h) return null;
    if (m[1] === "pb") { const v = ["large", "medium"].map(k => h.videos && h.videos[k]).find(v => v && v.url); return v ? v.url : null; }
    return h.largeImageURL || it.url;
  } catch (e) { return it.url; }
}

(async function main() {
  if (!PEXELS && !PIXABAY) { log("لا يوجد مفتاح Pexels أو Pixabay — الفيديو بخلفية متحركة"); return; }
  const reel = readJSON(path.join(ROOT, "social", "reel.json"), { scenes: [] });
  const used = readJSON(USED, []);
  const usedIds = new Set(used.map(u => u.id));
  const recent = new Set(used.filter(u => Date.now() - Date.parse(u.date || 0) < 7 * 86400000).map(u => u.id));
  const lib = readJSON(LIB, { items: [] });
  if (!Array.isArray(lib.items)) lib.items = [];
  const before = lib.items.length;
  lib.items = lib.items.filter(x => !FOOD.concat(["motherboard", "circuit board", "cpu"]).some(b => (" " + String(x.desc || "").toLowerCase()).includes(" " + b.trim())));
  if (lib.items.length < before) log("تنظيف المكتبة: حذف " + (before - lib.items.length) + " لقطة غير مناسبة");
  if (!CF_ID || !CF_TOKEN) log("لا يوجد مفتاح Cloudflare — بدون صور مولّدة (أضف CF_ACCOUNT_ID و CF_API_TOKEN)");
  const saveLib = () => { try { fs.writeFileSync(LIB, JSON.stringify(lib, null, 1)); } catch (e) {} };
  log("مكتبة اللقطات المعتمدة: " + lib.items.length + " لقطة");
  const seed = Math.floor(Date.now() / 86400000);
  const taken = new Set();
  const credits = [];
  const montageUses = {};
  const cache = {};
  const n = reel.scenes.length;
  fs.mkdirSync(OUT, { recursive: true });

  async function batchFor(kind, qs, keys) {
    const batch = [];
    for (const q of qs) {
      const key = kind + ":" + q;
      if (!cache[key]) { try { cache[key] = kind === "photo" ? await pixabayPhotos(q) : await search(q); } catch (e) { log(e.message); cache[key] = []; } }
      cache[key].filter(v => !taken.has(v.id) && !batch.some(b => b.id === v.id) && !lib.items.some(x => x.id === v.id && x.bad) && relevant(v.tags, keys.concat(q.split(" ").filter(w => w.length > 3)), q))
        .slice(0, 7).forEach(v => batch.push(Object.assign({ q: q }, v)));
    }
    batch.sort((a, b) => (usedIds.has(a.id) - usedIds.has(b.id)));
    return batch.slice(0, 8);
  }

  async function fromLibrary(trade, i) {
    const pool = lib.items.filter(x => !x.dead && !taken.has(x.id) && (x.trade === trade || trade === "كل الخدمات"))
      .sort((a, b) => (recent.has(a.id) - recent.has(b.id)) || ((b.kind === "video") - (a.kind === "video")) || (b.score - a.score));
    for (const it of pool.slice(0, 3)) {
      const url = await freshUrl(it);
      if (!url) { it.dead = true; continue; }
      const isPhoto = it.kind === "photo";
      try {
        await download(url, path.join(OUT, "bg" + i + (isPhoto ? ".jpg" : ".mp4")), isPhoto ? 20000 : 50000);
        log("مشهد " + (i + 1) + ": من مكتبة اللقطات المعتمدة (" + it.score + "/10: " + it.desc + ")");
        return Object.assign({}, it, { q: "library", src: (it.src || "Pixabay") + " · مكتبة" });
      } catch (e) { log(e.message); }
    }
    return null;
  }

  for (let i = 0; i < n - 1; i++) {
    const s = reel.scenes[i];
    if (s.kind === "services") continue;
    if (Date.now() - T0 > SCENE_CAP) { log("تجاوزنا " + SCENE_CAP / 60000 + " دقيقة للمشاهد — نكمل من المكتبة فقط"); }
    const strade = s.trade || reel.trade;
    const tr = tinfo(strade);
    const keys = tr.k.concat(GENERIC.k);
    const own = [].concat(s.broll || []).map(x => String(x).trim().toLowerCase()).filter(Boolean).map(x => x.split(/\s+/).slice(0, 2).join(" "));
    const rot = tr.q.slice((seed + i) % tr.q.length).concat(tr.q.slice(0, (seed + i) % tr.q.length));
    const qs = [...new Set(own.concat(rot, GENERIC.q))];
    const plans = [
      { kind: "video", qs: qs.slice(0, 2), min: 8 },
      { kind: "gen" },
      { kind: "library" },
      { kind: "video", qs: qs.slice(2, 4), min: 6 },
      { kind: "photo", qs: qs.slice(0, 2), min: 7 },
      { kind: "photo", qs: qs.slice(2, 4), min: 7 }
    ];
    let got = null;
    for (const plan of plans) {
      if (got) break;
      if (plan.kind === "library") { got = await fromLibrary(strade, i); continue; }
      if (plan.kind === "gen") { got = await generated(s, i, seed); continue; }
      if (Date.now() - T0 > SCENE_CAP) continue;
      const cands = await batchFor(plan.kind, plan.qs, keys);
      if (!cands.length) continue;
      const j = await judge(s, strade, cands, plan.min);
      if (!j) { log("مشهد " + (i + 1) + ": الحَكَم غير متاح — لا نخاطر بلقطة غير مفحوصة"); continue; }
      const added = libAdd(lib, strade, j);
      if (added) { log("المكتبة: +" + added + " لقطة معتمدة (" + strade + ")"); saveLib(); }
      if (!j.pick) { log("مشهد " + (i + 1) + ": رُفضت دفعة " + (plan.kind === "photo" ? "صور" : "فيديو") + " (" + (j.scores || []).join(",") + ")"); await sleep(1200); continue; }
      const pick = j.pick;
      log("مشهد " + (i + 1) + ": الحَكَم اختار " + (plan.kind === "photo" ? "صورة" : "فيديو") + " بدرجة " + j.score + "/10");
      try {
        const isPhoto = pick.kind === "photo";
        await download(pick.url, path.join(OUT, "bg" + i + (isPhoto ? ".jpg" : ".mp4")), isPhoto ? 20000 : 50000);
        got = pick;
      } catch (e) { log(e.message); }
      await sleep(1200);
    }
    if (!got) {
      const slug = SLUGS[strade] || (strade === "كل الخدمات" ? Object.values(SLUGS)[(seed + i) % 11] : null);
      const mp = slug && path.join(ROOT, "social", "montage", slug + ".jpg");
      if (mp && fs.existsSync(mp) && (montageUses[slug] || 0) < 1) {
        fs.copyFileSync(mp, path.join(OUT, "bg" + i + ".jpg"));
        montageUses[slug] = (montageUses[slug] || 0) + 1;
        got = { id: "mont-" + slug, q: "montage", credit: "Pixabay", src: "مكتبة الخدمات", tags: slug };
      }
    }
    if (got) {
      taken.add(got.id);
      credits.push({ scene: i, id: got.id, q: got.q, credit: got.credit, src: got.src, tags: got.tags });
      log("مشهد " + (i + 1) + ": «" + got.q + "» ← " + got.src + " [" + String(got.tags).slice(0, 60) + "]");
    } else log("مشهد " + (i + 1) + ": بدون لقطة مناسبة — خلفية متحركة");
  }
  fs.writeFileSync(path.join(OUT, "broll.json"), JSON.stringify(credits, null, 1));
  const merged = used.concat(credits.map(c => ({ id: c.id, date: today, credit: c.credit, src: c.src }))).slice(-300);
  fs.writeFileSync(USED, JSON.stringify(merged, null, 1));
  log("تم: " + credits.length + " لقطة حقيقية");

  // ===== الحصاد: نستغل الوقت المتبقي لبناء مكتبة كل التخصصات تدريجياً =====
  const trades = Object.keys(TRADE);
  const order = [reel.trade].concat(trades.slice(seed % 11), trades.slice(0, seed % 11)).filter((t, k, a) => TRADE[t] && a.indexOf(t) === k);
  let harvested = 0;
  for (const t of order) {
    if (Date.now() - T0 > HARVEST_CAP) break;
    const have = lib.items.filter(x => x.trade === t && !x.dead && x.kind === "video").length;
    if (have >= 15) continue;
    const q = TRADE[t].q[(seed + have) % TRADE[t].q.length];
    const cands = (await batchFor("video", [q], TRADE[t].k)).filter(c => !lib.items.some(x => x.id === c.id));
    if (cands.length < 2) continue;
    const j = await judge({ text: t, visual: "clearly shows " + q + " work, tools or results inside a home" }, t, cands, 7);
    const added = libAdd(lib, t, j);
    harvested += added;
    log("الحصاد: " + t + " «" + q + "» +" + added + " (المجموع " + (have + added) + ")");
    saveLib();
    await sleep(1500);
  }
  saveLib();
  log("مكتبة اللقطات: " + lib.items.length + " لقطة" + (harvested ? " (حصاد اليوم +" + harvested + ")" : ""));
  if (Date.now() - T0 < MONTAGE_CAP) await montageLibrary();
})().catch(e => { console.error(e); process.exit(0); });
