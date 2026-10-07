const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const OUT = process.env.REEL_OUT || path.join(ROOT, "reel_out");
const PEXELS = process.env.PEXELS_API_KEY || "";
const PIXABAY = process.env.PIXABAY_API_KEY || "";
const USED = path.join(ROOT, "social", "broll_used.json");
const log = m => console.log("[اللقطات] " + m);

const TRADE_Q = {
  "سباكة": ["plumber fixing pipe", "water leak sink", "bathroom faucet"],
  "كهرباء": ["electrician wiring", "electrical panel", "light switch home"],
  "تكييف": ["air conditioner repair", "air conditioner indoor unit", "hvac technician"],
  "أجهزة كهربائية": ["washing machine repair", "home appliance repair", "refrigerator kitchen"],
  "نجارة": ["carpenter woodwork", "wooden door installation", "kitchen cabinets"],
  "تبليط": ["tile installation", "ceramic floor tiles", "bathroom tiles"],
  "دهان": ["painting wall roller", "house painter", "interior wall paint"],
  "جبس بورد": ["gypsum ceiling installation", "drywall installation", "modern ceiling lights"],
  "سمنت بورد": ["construction worker building", "cement board wall", "renovation site"],
  "حدادة": ["welding metal", "metal gate", "steel fabrication"],
  "بناء ولياسة": ["construction site building", "bricklayer wall", "plastering wall"]
};
const GENERIC = ["modern home interior", "home renovation", "handyman tools"];

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
    return files.length && v.duration >= 3 ? { id: "px" + v.id, url: files[0].link, credit: (v.user && v.user.name) || "Pexels", src: "Pexels" } : null;
  }).filter(Boolean);
}

async function pixabay(q) {
  const url = "https://pixabay.com/api/videos/?per_page=30&safesearch=true&key=" + PIXABAY + "&q=" + encodeURIComponent(q);
  const r = await fetch(url);
  if (!r.ok) throw new Error("pixabay " + r.status);
  const j = await r.json();
  return (j.hits || []).map(h => {
    const vs = ["large", "medium"].map(k => h.videos && h.videos[k]).filter(v => v && v.url);
    if (!vs.length || h.duration < 3) return null;
    const v = vs[0];
    const portrait = v.height > v.width;
    const sharp = portrait ? v.height >= 1280 : v.height >= 2000;
    return { id: "pb" + h.id, url: v.url, credit: h.user || "Pixabay", src: "Pixabay", rank: (portrait ? 2 : 0) + (sharp ? 1 : 0) };
  }).filter(Boolean).sort((a, b) => b.rank - a.rank);
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
  fs.mkdirSync(OUT, { recursive: true });
  for (let i = 0; i < n - 1; i++) {
    const s = reel.scenes[i];
    const qs = [s.broll, ...(TRADE_Q[reel.trade] || []), ...GENERIC].filter(Boolean);
    let got = null;
    for (const q of qs) {
      const res = (await search(q)).filter(v => !taken.has(v.id));
      if (!res.length) continue;
      const fresh = res.filter(v => !usedIds.has(v.id));
      const pool = fresh.length ? fresh : res;
      const pick = pool[(seed + i) % Math.min(pool.length, 6)];
      try {
        await download(pick.url, path.join(OUT, "bg" + i + ".mp4"));
        got = Object.assign({ q: q }, pick);
        break;
      } catch (e) { log(e.message); }
    }
    if (got) {
      taken.add(got.id);
      credits.push({ scene: i, id: got.id, q: got.q, credit: got.credit, src: got.src });
      log("مشهد " + (i + 1) + ": " + got.q + " ← " + got.src + " (" + got.credit + ")");
    } else log("مشهد " + (i + 1) + ": بدون لقطة");
  }
  fs.writeFileSync(path.join(OUT, "broll.json"), JSON.stringify(credits, null, 1));
  const date = new Date().toISOString().slice(0, 10);
  const merged = used.concat(credits.map(c => ({ id: c.id, date: date, credit: c.credit, src: c.src }))).slice(-300);
  fs.writeFileSync(USED, JSON.stringify(merged, null, 1));
  log("تم: " + credits.length + " لقطة");
})().catch(e => { console.error(e); process.exit(0); });
