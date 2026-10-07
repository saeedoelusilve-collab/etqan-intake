const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const OUT = process.env.REEL_OUT || path.join(ROOT, "reel_out");
const PEXELS = process.env.PEXELS_API_KEY || "";
const PIXABAY = process.env.PIXABAY_API_KEY || "";
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
const GENERIC = { q: ["home repair", "handyman", "house renovation", "repairman", "tools"], k: ["repair", "handyman", "renovat", "tool", "house", "home", "worker", "fix", "maintenance"] };
const BLOCK = ["sea", "ocean", "beach", "bird", "animal", "sunset", "sunrise", "mountain", "forest", "flower", "landscape", "sky", "cloud", "lake", "river", "nature", "wildlife", "dog", "cat", "fish", "waterfall", "tree", "leaf", "plant", "abstract", "particles", "background", "galaxy", "space", "fantasy", "christmas", "rain", "snow", "fire"];

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
    return files.length && v.duration >= 3 ? { id: "px" + v.id, url: files[0].link, credit: (v.user && v.user.name) || "Pexels", src: "Pexels", tags: tags.replace(/-/g, " "), portrait: true } : null;
  }).filter(Boolean);
}

async function pixabay(q) {
  const url = "https://pixabay.com/api/videos/?per_page=50&safesearch=true&order=popular&key=" + PIXABAY + "&q=" + encodeURIComponent(q);
  const r = await fetch(url);
  if (!r.ok) throw new Error("pixabay " + r.status);
  const j = await r.json();
  return (j.hits || []).map(h => {
    const vs = ["large", "medium"].map(k => h.videos && h.videos[k]).filter(v => v && v.url);
    if (!vs.length || h.duration < 3) return null;
    const v = vs[0];
    return { id: "pb" + h.id, url: v.url, credit: h.user || "Pixabay", src: "Pixabay", tags: h.tags || "", portrait: v.height > v.width, sharp: v.height >= 1400 || (v.height > v.width && v.height >= 1280) };
  }).filter(Boolean);
}

async function search(q) {
  let out = [];
  if (PEXELS) { try { out = out.concat(await pexels(q)); } catch (e) { log(e.message); } }
  if (PIXABAY && out.length < 3) { try { out = out.concat(await pixabay(q)); } catch (e) { log(e.message); } }
  return out;
}

async function download(url, file) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("download " + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 50000) throw new Error("ملف صغير");
  fs.writeFileSync(file, buf);
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
  const tr = TRADE[reel.trade] || GENERIC;
  const keys = tr.k.concat(GENERIC.k);
  const cache = {};
  fs.mkdirSync(OUT, { recursive: true });
  for (let i = 0; i < n - 1; i++) {
    const s = reel.scenes[i];
    const own = [].concat(s.broll || []).map(x => String(x).trim().toLowerCase()).filter(Boolean).map(x => x.split(/\s+/).slice(0, 2).join(" "));
    const rot = tr.q.slice((seed + i) % tr.q.length).concat(tr.q.slice(0, (seed + i) % tr.q.length));
    const qs = [...new Set(own.concat(rot, GENERIC.q))];
    let got = null;
    for (const q of qs) {
      if (!cache[q]) cache[q] = await search(q);
      const ok = cache[q].filter(v => !taken.has(v.id) && relevant(v.tags, keys.concat(q.split(" ").filter(w => w.length > 3)), q));
      if (!ok.length) { log("«" + q + "»: لا نتائج مطابقة"); continue; }
      const top = ok.slice(0, 10);
      top.sort((a, b) => (usedIds.has(a.id) - usedIds.has(b.id)) || ((b.portrait ? 2 : 0) + (b.sharp ? 1 : 0)) - ((a.portrait ? 2 : 0) + (a.sharp ? 1 : 0)));
      const pool = top.slice(0, 4);
      const pick = pool[(seed + i) % pool.length];
      try {
        await download(pick.url, path.join(OUT, "bg" + i + ".mp4"));
        got = Object.assign({ q: q }, pick);
        break;
      } catch (e) { log(e.message); }
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
})().catch(e => { console.error(e); process.exit(0); });
