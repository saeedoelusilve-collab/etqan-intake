const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const OUT = process.env.REEL_OUT || path.join(ROOT, "reel_out");
const PEXELS = process.env.PEXELS_API_KEY || "";
const PIXABAY = process.env.PIXABAY_API_KEY || "";
const GKEY = process.env.GEMINI_API_KEY || "";
let VISION = ["gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemini-3.1-flash-lite", "gemini-flash-latest"];
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
  "أجهزة كهربائية": { q: ["washing machine", "refrigerator", "appliance repair", "dishwasher", "kitchen appliance", "oven"], k: ["washing", "washer", "machine", "fridge", "refrigerator", "appliance", "dishwasher", "oven", "microwave", "laundry", "kitchen"] },
  "نجارة": { q: ["carpenter", "woodworking", "door handle", "wooden door", "kitchen cabinet", "furniture assembly"], k: ["carpent", "wood", "door", "cabinet", "furniture", "drill", "saw", "plank", "hinge", "handle", "wardrobe"] },
  "تبليط": { q: ["tiles", "tiling", "ceramic tiles", "floor tiles", "bathroom tiles", "tile installation"], k: ["tile", "tiling", "ceramic", "floor", "marble", "grout", "porcelain", "bathroom"] },
  "دهان": { q: ["painting wall", "paint roller", "house painting", "painter", "wall paint", "interior painting"], k: ["paint", "painter", "roller", "brush", "wall", "color", "colour", "decorat"] },
  "جبس بورد": { q: ["ceiling", "drywall", "plasterboard", "interior renovation", "ceiling lights", "living room interior"], k: ["ceiling", "drywall", "plaster", "gypsum", "interior", "renovat", "room", "lighting"] },
  "سمنت بورد": { q: ["construction worker", "renovation", "building construction", "facade", "construction site", "builder"], k: ["construct", "renovat", "build", "worker", "facade", "site", "cement", "concrete"] },
  "حدادة": { q: ["welding", "welder", "metal work", "steel", "metal gate", "grinder sparks"], k: ["weld", "metal", "steel", "iron", "spark", "grinder", "gate", "fabricat"] },
  "بناء ولياسة": { q: ["construction site", "bricklayer", "plastering", "cement", "building construction", "construction worker"], k: ["construct", "brick", "plaster", "cement", "concrete", "build", "mason", "worker", "site"] }
};
const GENERIC = { q: ["home repair", "handyman", "house renovation", "repairman", "tools"], k: ["repair", "handyman", "renovat", "tool", "maintenance", "screwdriver", "drill"] };
const BLOCK = ["sea", "ocean", "beach", "bird", "animal", "sunset", "sunrise", "mountain", "forest", "flower", "landscape", "sky", "cloud", "lake", "river", "nature", "wildlife", "dog", "cat", "fish", "waterfall", "tree", "leaf", "plant", "abstract", "particles", "background", "galaxy", "space", "fantasy", "christmas", "rain", "snow", "fire", "prayer", "pray", "mosque", "church", "temple", "religio", "worship", "synagogue", "jew", "christian", "cross", "bible", "woman", "women", "girl", "lady", "female", "model", "fashion", "beauty", "bikini", "beer", "wine", "alcohol", "smok", "party", "port", "ship", "harbor", "harbour", "container", "skyline", "traffic", "city", "flag", "dance", "wedding", "kiss", "couple"];

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

async function judge(scene, trade, cands) {
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
    "Give 0 if ANY of these: unrelated subject; women or girls; a person's face as the main subject; religious buildings, symbols, rituals or gatherings of any religion; alcohol or smoking; nudity or swimwear; visible text, logos or watermarks; nature, landscape, sea, sky or animals; cartoon, 3D render or abstract graphics; flags.\n" +
    'Return JSON only: {"scores":[one number per image in order]}';
  const parts = [{ text: prompt }];
  imgs.forEach((x, i) => { parts.push({ text: "Image " + i + ":" }); parts.push({ inline_data: { mime_type: x.img.mime, data: x.img.data } }); });
  for (const m of VISION) {
    if (DEADV.has(m)) continue;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + m + ":generateContent?key=" + GKEY, {
          method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(45000),
          body: JSON.stringify({ contents: [{ parts: parts }], generationConfig: { temperature: 0.1, responseMimeType: "application/json" } })
        });
        if (r.status === 503 && attempt === 1) { await sleep(3000); continue; }
        if (!r.ok) { log("الحَكَم " + m + " ← " + r.status); if (r.status !== 503) DEADV.add(m); break; }
        const j = await r.json();
        const t = ((j.candidates || [])[0] || {}).content;
        const txt = ((t && t.parts) || []).filter(x => x.text && !x.thought).map(x => x.text).join("");
        const o = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
        const sc = (o.scores || []).map(Number);
        let best = -1, bs = -1;
        sc.forEach((v, i) => { if (v > bs) { bs = v; best = i; } });
        if (best < 0 || bs < 6 || !imgs[best]) return { pick: null, scores: sc };
        return { pick: imgs[best].c, score: bs, scores: sc };
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

(async function main() {
  if (!PEXELS && !PIXABAY) { log("لا يوجد مفتاح Pexels أو Pixabay — الفيديو بخلفية متحركة"); return; }
  const reel = readJSON(path.join(ROOT, "social", "reel.json"), { scenes: [] });
  const used = readJSON(USED, []);
  const usedIds = new Set(used.map(u => u.id));
  const seed = Math.floor(Date.now() / 86400000);
  const taken = new Set();
  const credits = [];
  const n = reel.scenes.length;
  const tr = TRADE[reel.trade] || (reel.trade === "كل الخدمات"
    ? { q: Object.values(TRADE).map(t => t.q[0]), k: [].concat(...Object.values(TRADE).map(t => t.k)) } : GENERIC);
  const keys = tr.k.concat(GENERIC.k);
  const cache = {};
  fs.mkdirSync(OUT, { recursive: true });
  for (let i = 0; i < n - 1; i++) {
    if (Date.now() - T0 > 7 * 60000) { log("تجاوزنا 7 دقائق — بقية المشاهد بخلفية متحركة"); break; }
    const s = reel.scenes[i];
    if (s.kind === "services") continue;
    const own = [].concat(s.broll || []).map(x => String(x).trim().toLowerCase()).filter(Boolean).map(x => x.split(/\s+/).slice(0, 2).join(" "));
    const rot = tr.q.slice((seed + i) % tr.q.length).concat(tr.q.slice(0, (seed + i) % tr.q.length));
    const qs = [...new Set(own.concat(rot, GENERIC.q))];
    let got = null;
    const plans = [
      { kind: "video", qs: qs.slice(0, 2) }, { kind: "video", qs: qs.slice(2, 4) },
      { kind: "photo", qs: qs.slice(0, 2) }, { kind: "photo", qs: qs.slice(2, 4) }
    ];
    for (const plan of plans) {
      if (got || Date.now() - T0 > 7 * 60000) break;
      const batch = [];
      for (const q of plan.qs) {
        const key = plan.kind + ":" + q;
        if (!cache[key]) { try { cache[key] = plan.kind === "photo" ? await pixabayPhotos(q) : await search(q); } catch (e) { log(e.message); cache[key] = []; } }
        cache[key].filter(v => !taken.has(v.id) && !batch.some(b => b.id === v.id) && relevant(v.tags, keys.concat(q.split(" ").filter(w => w.length > 3)), q))
          .slice(0, 7).forEach(v => batch.push(Object.assign({ q: q }, v)));
      }
      if (!batch.length) continue;
      batch.sort((a, b) => (usedIds.has(a.id) - usedIds.has(b.id)));
      const cands = batch.slice(0, 10);
      const j = await judge(s, reel.trade, cands);
      let pick = null;
      if (j) {
        if (j.pick) { pick = j.pick; log("مشهد " + (i + 1) + ": الحَكَم اختار " + (plan.kind === "photo" ? "صورة" : "فيديو") + " بدرجة " + j.score + "/10"); }
        else { log("مشهد " + (i + 1) + ": رُفضت دفعة " + (plan.kind === "photo" ? "صور" : "فيديو") + " (" + (j.scores || []).join(",") + ")"); await sleep(1200); continue; }
      } else {
        const strong = cands.filter(v => tr.k.filter(k => String(v.tags).toLowerCase().includes(k)).length >= 2);
        if (!strong.length) continue;
        pick = strong[0];
        log("مشهد " + (i + 1) + ": اختيار بالوسوم المؤكدة (الحَكَم غير متاح)");
      }
      try {
        const isPhoto = pick.kind === "photo";
        await download(pick.url, path.join(OUT, "bg" + i + (isPhoto ? ".jpg" : ".mp4")), isPhoto ? 20000 : 50000);
        got = pick;
      } catch (e) { log(e.message); }
      await sleep(1200);
    }
    if (got) {
      taken.add(got.id);
      credits.push({ scene: i, id: got.id, q: got.q, credit: got.credit, src: got.src, tags: got.tags });
      log("مشهد " + (i + 1) + ": «" + got.q + "» ← " + got.src + " [" + String(got.tags).slice(0, 60) + "]");
    } else log("مشهد " + (i + 1) + ": بدون لقطة مناسبة — خلفية متحركة");
  }
  fs.writeFileSync(path.join(OUT, "broll.json"), JSON.stringify(credits, null, 1));
  const date = new Date().toISOString().slice(0, 10);
  const merged = used.concat(credits.map(c => ({ id: c.id, date: date, credit: c.credit, src: c.src }))).slice(-300);
  fs.writeFileSync(USED, JSON.stringify(merged, null, 1));
  log("تم: " + credits.length + " لقطة");
  await montageLibrary();
})().catch(e => { console.error(e); process.exit(0); });
