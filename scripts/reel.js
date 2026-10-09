const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = process.cwd();
const OUT = process.env.REEL_OUT || path.join(ROOT, "reel_out");
const LOGO = path.join(ROOT, "logo.png");
const FPS = 30;
const log = m => console.log("[الفيديو] " + m);

function loadPW() {
  for (const n of ["playwright-core", "playwright"]) { try { return require(n); } catch (e) {} }
  throw new Error("playwright غير مثبت");
}

function findChrome() {
  if (process.env.CHROME && fs.existsSync(process.env.CHROME)) return process.env.CHROME;
  for (const p of ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"]) if (fs.existsSync(p)) return p;
  try {
    const d = "/opt/pw-browsers";
    const c = fs.readdirSync(d).filter(x => /^chromium-\d+$/.test(x)).sort().pop();
    if (c) return path.join(d, c, "chrome-linux", "chrome");
  } catch (e) {}
  return null;
}

const ICONS = {
  ac: '<path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19M9 3l3 2 3-2M9 21l3-2 3 2M3 9l2 3-2 3M21 9l-2 3 2 3"/>',
  drop: '<path d="M12 3c4 5 6.5 8 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 11 8 8 12 3z"/><path d="M9 15a3 3 0 0 0 3 3"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
  paint: '<path d="M4 4h13v5H4zM17 6.5h3V12h-8v3"/><path d="M11 15h2v6h-2z"/>',
  tile: '<path d="M3 3h18v18H3zM3 12h18M12 3v18"/>',
  hammer: '<path d="M15 3l6 6-3 3-6-6zM12 6L3 15l3 3 9-9"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>',
  home: '<path d="M3 11l9-8 9 8M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
  plug: '<path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4"/>',
  flame: '<path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-7 1 2 2 3 3 3 0-3-1-5 0-8z"/>',
  thermo: '<path d="M10 4a2 2 0 0 1 4 0v10a4 4 0 1 1-4 0z"/><path d="M12 9v8"/>',
  fan: '<circle cx="12" cy="12" r="2"/><path d="M12 10c0-5 3-7 5-5s-1 5-5 5M14 12c5 0 7 3 5 5s-5-1-5-5M10 12c-5 0-7-3-5-5s5 1 5 5M12 14c0 5-3 7-5 5s1-5 5-5"/>',
  building: '<path d="M4 21V3h10v18M14 9h6v12M7 7h4M7 11h4M7 15h4M2 21h20"/>',
  door: '<path d="M6 3h12v18H6z"/><path d="M15 12h.01M3 21h18"/>',
  calendar: '<path d="M4 5h16v16H4zM4 10h16M8 3v4M16 3v4"/>',
  star: '<path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4 6.5 20.3l1-6.2L3 9.7l6.2-.9z"/>'
};
const TRADE_ICON = { "سباكة": "drop", "كهرباء": "bolt", "تكييف": "ac", "أجهزة كهربائية": "plug", "نجارة": "door", "تبليط": "tile", "دهان": "paint", "جبس بورد": "home", "سمنت بورد": "building", "حدادة": "hammer", "بناء ولياسة": "building" };
const DEFAULT_SEQ = ["alert", "clock", "wrench", "check"];
const SERVICES = [
  { n: "سباكة", slug: "plumbing", icon: "drop" }, { n: "كهرباء", slug: "electrical", icon: "bolt" }, { n: "تكييف", slug: "hvac", icon: "ac" },
  { n: "أجهزة", slug: "appliances", icon: "plug" }, { n: "نجارة", slug: "carpentry", icon: "door" }, { n: "تبليط", slug: "tiling", icon: "tile" },
  { n: "دهان", slug: "painting", icon: "paint" }, { n: "جبس بورد", slug: "gypsum", icon: "home" }, { n: "سمنت بورد", slug: "cementboard", icon: "building" },
  { n: "حدادة", slug: "blacksmith", icon: "hammer" }, { n: "بناء", slug: "building", icon: "wrench" }
];
const MONTAGE = path.join(ROOT, "social", "montage");

function servicesHTML(s, logo) {
  const ws = s.words || [];
  const norm = x => String(x).replace(/[،,.:؛]/g, "").replace(/^و/, "");
  const times = SERVICES.map((sv, k) => {
    const tok = sv.n.split(" ")[0];
    const colon = ws.findIndex(w => /[:：]$/.test(String(w.w)));
    const span = Math.max(2.4, (s.dur || 5) * 0.62);
    if (colon < 0) return 0.35 + k * (span / SERVICES.length);
    const w = ws.slice(colon + 1).find(w => norm(w.w) === tok || norm(w.w).startsWith(tok));
    return w ? w.s : 0.35 + k * (span / SERVICES.length);
  });
  const endT = ws.length ? ws[ws.length - 1].s : 0.6 + SERVICES.length * 0.35;
  const tiles = SERVICES.map((sv, k) => {
    const img = path.join(MONTAGE, sv.slug + ".jpg");
    const ph = fs.existsSync(img) ? `<img class="ph" src="file://${img}" alt="">` : "";
    return `<div class="tile" data-t="${times[k].toFixed(3)}" data-k="${k}">${ph}<div class="tv"></div><svg viewBox="0 0 24 24">${ICONS[sv.icon]}</svg><b>${esc(sv.n)}</b></div>`;
  }).join("") + `<div class="tile brandtile" data-t="${endT.toFixed(3)}" data-k="${SERVICES.length}"><div class="lgx">${logo}</div><b>المنجز</b></div>`;
  return `<div class="svh">${esc(s.text || "كل ما يحتاجه بيتك")}</div><div class="grid">${tiles}</div>`;
}

const esc = s => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function page(tl) {
  const n = tl.scenes.length;
  const tradeIcon = TRADE_ICON[tl.trade] || "wrench";
  const logo = fs.existsSync(LOGO) ? `<img src="file://${LOGO}" alt="">` : `<b>م</b>`;
  const scenes = tl.scenes.map((s, i) => {
    const last = i === n - 1;
    if (s.kind === "services") return `<section class="sc svc" id="s${i}"><div class="cam">${servicesHTML(s, logo)}</div><div class="cap" style="display:none"></div></section>`;
    const icon = ICONS[s.icon] ? s.icon : (i === 0 ? tradeIcon : DEFAULT_SEQ[(i - 1) % DEFAULT_SEQ.length]);
    const words = String(s.text || "").split(/\s+/).filter(Boolean);
    const key = String(s.key || "").trim();
    let keyIdx = words.findIndex(w => key && (w === key || w.replace(/[؟?!.،]/g, "") === key));
    if (keyIdx < 0) keyIdx = i === 0 ? -1 : words.length - 1;
    const head = words.map((w, k) => k === keyIdx ? `<span class="w key"><i class="hl"></i><em>${esc(w)}</em></span>` : `<span class="w"><em>${esc(w)}</em></span>`).join(" ");
    const lab = String(s.label || "").trim() || ["المشكلة", "السبب", "الحل", "النتيجة"][Math.min(i - 1, 3)];
    const chip = i === 0 || last ? "" : `<div class="chip">${esc(lab.split(/\s+/).slice(0, 2).join(" "))}</div>`;
    // تقسيم متوازن: عبارة لكل علامة ترقيم، والعبارة الطويلة تُقسم بالتساوي (لا كلمة يتيمة في آخر السطر)
    const wl = s.words || [], phr = [];
    let cur = [];
    wl.forEach((w, k) => { cur.push(k); if (/[،,.؟?!:]$/.test(String(w.w)) || k === wl.length - 1) { phr.push(cur); cur = []; } });
    for (let p = phr.length - 1; p > 0; p--) if (phr[p].length === 1 && phr[p - 1].length <= 4) { phr[p - 1] = phr[p - 1].concat(phr[p]); phr.splice(p, 1); }
    if (phr.length > 1 && phr[0].length === 1 && phr[1].length <= 4) { phr[1] = phr[0].concat(phr[1]); phr.shift(); }
    const cid = [];
    let ch = 0;
    phr.forEach(pp => { const m = Math.ceil(pp.length / 4); pp.forEach((k, j) => { cid[k] = ch + Math.floor(j * m / pp.length); }); ch += m; });
    const cap = wl.map((w, k) => `<span class="cw" data-c="${cid[k] || 0}">${esc(w.w)}</span>`).join(" ");
    const kar = i > 0 && !last;
    const visual = last
      ? `<div class="card"><div class="ct"><span class="dot"></span>طلب فنّي جديد</div>
         <div class="row"><span>الخدمة</span><b>${esc(tl.trade && tl.trade !== "كل الخدمات" ? tl.trade : "أي خدمة في بيتك")}</b></div>
         <div class="row"><span>الحي</span><b>حيّك في المدينة</b></div>
         <div class="row"><span>الوقت</span><b>دقيقة واحدة</b></div>
         <div class="btn"><span class="b1">أرسل الطلب</span><span class="b2">تم استلام طلبك ✓</span></div>
         <div class="ptr"></div><div class="rip"></div></div>`
      : `<div class="ico"><div class="ring"></div><div class="ring r2"></div><div class="disc"><svg viewBox="0 0 24 24">${ICONS[icon]}</svg></div></div>`;
    const fx = tl.fx && tl.fx[i];
    return `<section class="sc${i === 0 ? " hook" : ""}${last ? " cta" : ""}${kar ? " kar" : ""}${fx ? " fx" : ""}" id="s${i}">${fx ? '<div class="scrim"></div>' : ""}
      <div class="cam">${visual}${chip}<h1>${head}</h1></div>
      <div class="cap">${cap}</div></section>`;
  }).join("");
  const bars = tl.scenes.map(() => '<i><b></b></i>').join("");

  const anyFx = (tl.fx || []).some(Boolean);
  return `<!DOCTYPE html><html lang="ar" dir="rtl"${anyFx ? ' class="fx"' : ""}><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.gstatic.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@500;700&display=block" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1920px;overflow:hidden;background:#041f1d}
body{font-family:"IBM Plex Sans Arabic","Noto Kufi Arabic","Noto Sans Arabic",sans-serif;color:#fff;position:relative}
html.fx,html.fx body{background:transparent}
.scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(3,24,23,.78) 0%,rgba(3,24,23,.2) 20%,rgba(3,24,23,.38) 40%,rgba(3,24,23,.62) 58%,rgba(3,24,23,.9) 100%)}
.sc.fx .ico{display:none}
.sc.fx h1{text-shadow:0 6px 30px rgba(0,0,0,.6)}
.sc.fx .cap{background:rgba(0,0,0,.5)}
#bg{position:absolute;inset:0;background:linear-gradient(170deg,#0b4744 0%,#062e2c 45%,#031716 100%)}
.blob{position:absolute;border-radius:50%}
#b1{width:1300px;height:1300px;background:radial-gradient(circle,rgba(38,171,160,.55),rgba(38,171,160,0) 65%)}
#b2{width:1100px;height:1100px;background:radial-gradient(circle,rgba(198,149,65,.32),rgba(198,149,65,0) 65%)}
#b3{width:900px;height:900px;background:radial-gradient(circle,rgba(90,200,220,.22),rgba(90,200,220,0) 65%)}
#grid{position:absolute;inset:-200px;background-image:linear-gradient(rgba(255,255,255,.035) 2px,transparent 2px),linear-gradient(90deg,rgba(255,255,255,.035) 2px,transparent 2px);background-size:120px 120px}
#vig{position:absolute;inset:0;background:radial-gradient(120% 80% at 50% 45%,transparent 55%,rgba(0,0,0,.55))}
#grain{position:absolute;inset:-100px;opacity:.07;mix-blend-mode:overlay}
#bars{position:absolute;top:64px;left:70px;right:70px;display:flex;gap:12px;z-index:20}
#bars i{flex:1;height:8px;border-radius:8px;background:rgba(255,255,255,.22);overflow:hidden;display:block}
#bars b{display:block;height:100%;width:0;background:linear-gradient(90deg,#f6d38a,#c69541);margin-right:0;float:right}
#brand{position:absolute;top:110px;left:0;right:0;display:flex;justify-content:center;align-items:center;gap:16px;z-index:20;font-weight:700;font-size:40px;letter-spacing:0}
#brand .lg{width:72px;height:72px;border-radius:20px;background:#fff;display:grid;place-items:center;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.3)}
#brand .lg img{width:86%;height:86%;object-fit:contain}#brand .lg b{color:#0e4c4a;font-size:40px}
#brand small{font-weight:500;font-size:28px;opacity:.7;margin-right:6px}
.sc{position:absolute;inset:0;display:none}
.cam{position:absolute;inset:0;transform-origin:50% 45%}
.ico{position:absolute;left:50%;top:575px;width:340px;height:340px;margin:-170px 0 0 -170px}
.disc{position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 35% 30%,#1d8f87,#0c4f4b 70%);box-shadow:0 30px 80px rgba(0,0,0,.45),inset 0 2px 0 rgba(255,255,255,.25),0 0 0 3px rgba(246,211,138,.5);display:grid;place-items:center}
.disc svg{width:190px;height:190px;fill:none;stroke:#f6d38a;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 0 18px rgba(246,211,138,.55))}
.ring{position:absolute;inset:0;border-radius:50%;border:4px solid rgba(246,211,138,.6)}
h1{position:absolute;left:70px;right:70px;top:860px;text-align:center;font-size:104px;line-height:1.38;font-weight:700}
.hook h1{color:#f6d38a;font-size:118px;text-shadow:0 10px 40px rgba(0,0,0,.4)}
.cta h1{top:1050px;font-size:78px}
.cta .cap{top:1330px;font-size:44px}
.chip{position:absolute;left:50%;top:772px;transform:translateX(-50%);background:rgba(246,211,138,.14);border:2px solid rgba(246,211,138,.55);color:#f6d38a;font-size:36px;font-weight:700;padding:6px 34px;border-radius:999px;white-space:nowrap}
h1 .w em{text-shadow:0 8px 30px rgba(0,0,0,.35)}
.w{position:relative;display:inline-block;white-space:nowrap}
.w em{position:relative;font-style:normal;display:inline-block}
.hl{position:absolute;left:-14px;right:-14px;top:12%;bottom:6%;background:linear-gradient(90deg,#c69541,#f6d38a);border-radius:18px;transform:scaleX(0);transform-origin:100% 50%}
.key em{color:#1d1300}
.hook .key em{color:#1d1300}
.cap{position:absolute;left:90px;right:90px;top:1300px;text-align:center;font-size:50px;line-height:1.55;font-weight:500}
.cap{padding:18px 30px;border-radius:28px;background:rgba(0,0,0,.32);backdrop-filter:none}
.cw{display:inline-block;opacity:.45;transition:none}
.hook .cap,.cta .cap{display:none}
.kar h1{display:none}
.kar .cap{top:870px;left:60px;right:60px;font-size:84px;font-weight:700;line-height:1.35;background:none;padding:0;text-shadow:0 6px 26px rgba(0,0,0,.65)}
.sc.fx.kar .cap{background:none}
.kar .cw{display:none;opacity:.6}
.kar .cw.vis{display:inline-block}
.kar .cw.on{opacity:1;color:#f6d38a;transform:scale(1.06)}
.kar .cw.past{opacity:1;color:#fff}
.cw.on{opacity:1;color:#f6d38a;transform:scale(1.08)}
.cw.past{opacity:1}
.card{position:absolute;left:150px;right:150px;top:330px;height:690px;border-radius:44px;background:linear-gradient(160deg,rgba(255,255,255,.16),rgba(255,255,255,.06));border:2px solid rgba(255,255,255,.22);box-shadow:0 40px 100px rgba(0,0,0,.45);padding:50px 50px;overflow:hidden}
.ct{font-size:46px;font-weight:700;margin-bottom:34px;display:flex;align-items:center;gap:16px}
.dot{width:22px;height:22px;border-radius:50%;background:#3ee08f;box-shadow:0 0 18px #3ee08f}
.row{display:flex;justify-content:space-between;align-items:center;background:rgba(0,0,0,.22);border-radius:24px;padding:22px 30px;margin-bottom:18px;font-size:38px}
.row span{opacity:.7}.row b{color:#f6d38a}
.btn{position:relative;margin-top:30px;height:120px;border-radius:30px;background:linear-gradient(90deg,#c69541,#f6d38a);color:#1d1300;font-size:46px;font-weight:700;display:grid;place-items:center;overflow:hidden}
.btn span{grid-area:1/1}.b2{opacity:0;color:#fff}
.ptr{position:absolute;width:86px;height:86px;border-radius:50%;background:rgba(255,255,255,.9);box-shadow:0 0 0 14px rgba(255,255,255,.25);left:0;top:0;opacity:0}
.rip{position:absolute;width:60px;height:60px;border-radius:50%;border:6px solid #fff;left:0;top:0;opacity:0}
.svh{position:absolute;left:40px;right:40px;top:300px;text-align:center;font-size:72px;white-space:nowrap;font-weight:700;color:#f6d38a;text-shadow:0 8px 30px rgba(0,0,0,.4)}
.grid{position:absolute;left:66px;right:66px;top:470px;display:grid;grid-template-columns:repeat(3,1fr);gap:22px}
.tile{position:relative;height:250px;border-radius:34px;overflow:hidden;background:linear-gradient(160deg,#145f5a,#082f2d);border:3px solid rgba(255,255,255,.14);box-shadow:0 18px 40px rgba(0,0,0,.35);display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding-bottom:26px}
.tile .ph{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:grayscale(1) brightness(.55)}
.tile .tv{position:absolute;inset:0;background:linear-gradient(180deg,rgba(4,31,29,.15) 30%,rgba(4,31,29,.88))}
.tile svg{position:relative;width:76px;height:76px;fill:none;stroke:#f6d38a;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;margin-bottom:14px;filter:drop-shadow(0 0 12px rgba(246,211,138,.5))}
.tile b{position:relative;font-size:46px;font-weight:700;color:#fff}
.tile.on{border-color:#f6d38a;box-shadow:0 0 0 4px rgba(246,211,138,.35),0 22px 50px rgba(0,0,0,.45)}
.tile.on .ph{filter:none}
.brandtile{background:linear-gradient(160deg,#c69541,#f6d38a);justify-content:center;padding:0}
.brandtile b{color:#1d1300}
.brandtile .lgx{width:110px;height:110px;border-radius:28px;background:#fff;display:grid;place-items:center;overflow:hidden;margin-bottom:12px}
.brandtile .lgx img{width:86%;height:86%;object-fit:contain}.brandtile .lgx b{color:#0e4c4a;font-size:60px}
#wipe{position:absolute;top:-200px;bottom:-200px;width:1700px;left:-310px;z-index:30;transform:translateX(200%) skewX(-14deg);pointer-events:none}
#wipe .g{position:absolute;inset:0;background:linear-gradient(90deg,#c69541,#f6d38a 50%,#c69541)}
#wipe .t{position:absolute;top:0;bottom:0;width:260px;right:-260px;background:#0e4c4a}
#flash{position:absolute;inset:0;background:#fff;opacity:0;z-index:31}
#out{position:absolute;inset:0;display:none;z-index:10;text-align:center}
#out .big{position:absolute;left:50%;top:560px;width:300px;height:300px;margin-left:-150px;border-radius:80px;background:#fff;display:grid;place-items:center;overflow:hidden;box-shadow:0 40px 120px rgba(0,0,0,.5),0 0 0 6px rgba(246,211,138,.6)}
#out .big img{width:84%;height:84%;object-fit:contain}#out .big b{color:#0e4c4a;font-size:170px}
#out .shine{position:absolute;top:-50%;bottom:-50%;width:90px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.85),transparent);transform:rotate(20deg)}
#out h2{position:absolute;left:0;right:0;top:920px;font-size:150px;font-weight:700}
#out p{position:absolute;left:0;right:0;top:1140px;font-size:50px;opacity:.85;font-weight:500}
#out .pill{position:absolute;left:50%;top:1270px;transform:translateX(-50%);white-space:nowrap;background:linear-gradient(90deg,#c69541,#f6d38a);color:#1d1300;font-size:52px;font-weight:700;padding:26px 64px;border-radius:999px;box-shadow:0 20px 60px rgba(198,149,65,.35)}
</style></head><body>
<div id="bg"><div class="blob" id="b1"></div><div class="blob" id="b2"></div><div class="blob" id="b3"></div><div id="grid"></div><canvas id="grain" width="640" height="1140"></canvas><div id="vig"></div></div>
<div id="bars">${bars}</div>
<div id="brand"><div class="lg">${logo}</div><span>المنجز<small>· المدينة المنورة</small></span></div>
${scenes}
<div id="out"><div class="big">${logo}<div class="shine"></div></div><h2>المنجز</h2><p>فنّيك الموثوق في المدينة المنورة</p><div class="pill">الرابط في البايو · الطلب مجاني</div></div>
<div id="wipe"><div class="g"></div><div class="t"></div></div><div id="flash"></div>
<script>
var TL=${JSON.stringify(tl).replace(/</g, "\\u003c")};
var N=TL.scenes.length;
function cl(x){return x<0?0:x>1?1:x}
function oc(x){x=cl(x);return 1-Math.pow(1-x,3)}
function ob(x){x=cl(x);var c=1.70158,d=c+1;return 1+d*Math.pow(x-1,3)+c*Math.pow(x-1,2)}
function io(x){x=cl(x);return x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2}
function $(q,r){return (r||document).querySelector(q)}
function $$(q,r){return Array.prototype.slice.call((r||document).querySelectorAll(q))}
var gr=$("#grain"),gx=gr.getContext("2d"),gimg=gx.createImageData(640,1140);
for(var k=0;k<gimg.data.length;k+=4){var v=Math.random()*255;gimg.data[k]=gimg.data[k+1]=gimg.data[k+2]=v;gimg.data[k+3]=255}
gx.putImageData(gimg,0,0);gr.style.width="1280px";gr.style.height="2280px";
var S=TL.scenes.map(function(s,i){var el=$("#s"+i);el.querySelectorAll(".disc svg path,.disc svg circle").forEach(function(p){p.setAttribute("pathLength","1");p.style.strokeDasharray="1";});
var r=el.querySelector(".btn");return {s:s,el:el,cam:$(".cam",el),words:$$(".w",el),hls:$$(".hl",el),cws:$$(".cw",el),cap:$(".cap",el),ico:$(".ico",el),disc:$(".disc",el),paths:$$(".disc svg path,.disc svg circle",el),rings:$$(".ring",el),card:$(".card",el),btn:r,b1:$(".b1",el),b2:$(".b2",el),ptr:$(".ptr",el),rip:$(".rip",el),rows:$$(".row,.ct",el),tiles:$$(".tile",el),svh:$(".svh",el)}});
var bounds=TL.scenes.map(function(s){return s.start}).slice(1).concat([TL.outro]);
function render(t){
  $("#b1").style.transform="translate("+(-300+Math.sin(t*.35)*160)+"px,"+(-350+Math.cos(t*.28)*140)+"px)";
  $("#b2").style.transform="translate("+(420+Math.cos(t*.3)*170)+"px,"+(1150+Math.sin(t*.4)*150)+"px)";
  $("#b3").style.transform="translate("+(500+Math.sin(t*.5+1)*200)+"px,"+(250+Math.cos(t*.33)*180)+"px)";
  $("#grid").style.transform="translate("+((t*18)%120)+"px,"+((t*30)%120)+"px)";
  gr.style.transform="translate("+(-(Math.floor(t*30)*37)%100)+"px,"+(-(Math.floor(t*30)*53)%100)+"px)";
  var bs=$$("#bars b");
  TL.scenes.forEach(function(s,i){bs[i].style.width=(cl((t-s.start)/s.dur)*100)+"%"});
  var cur=-1;for(var i=0;i<N;i++){if(t>=TL.scenes[i].start)cur=i}
  if(t<TL.scenes[0].start)cur=0;
  var outro=t>=TL.outro;
  S.forEach(function(o,i){o.el.style.display=(!outro&&i===cur)?"block":"none"});
  $("#out").style.display=outro?"block":"none";
  $("#bg").style.opacity=(!outro&&TL.fx&&TL.fx[cur])?0:1;
  $("#brand").style.opacity=outro?0:cl(t/.4);
  var wx=200;bounds.forEach(function(b){var p=(t-(b-.34))/.68;if(p>=0&&p<=1)wx=200-400*io(p)});
  $("#wipe").style.transform="translateX("+wx+"%) skewX(-14deg)";
  $("#flash").style.opacity=0;
  if(outro){var l=t-TL.outro;
    $("#out .big").style.transform="scale("+(.4+.6*ob(l/.55))+") rotate("+((1-oc(l/.6))*-12)+"deg)";
    $("#out .shine").style.left=(-120+460*io((l-.5)/.7))+"px";
    $("#out h2").style.transform="translateY("+(60*(1-oc((l-.2)/.5)))+"px)";$("#out h2").style.opacity=cl((l-.2)/.35);
    $("#out p").style.opacity=cl((l-.4)/.4);
    $("#out .pill").style.transform="translateX(-50%) scale("+(.6+.4*ob((l-.55)/.45))+")";$("#out .pill").style.opacity=cl((l-.55)/.25);
    return}
  var o=S[cur],s=o.s,lt=t-s.start;if(cur===0)lt=Math.max(lt,0)+.12;
  var z=1+.045*cl(lt/s.dur);
  if(cur===0){var pz=1.22-.22*ob(lt/.38);z*=pz;var sh=lt<.32?(1-lt/.32):0;o.cam.style.transform="translate("+(Math.sin(lt*90)*14*sh)+"px,"+(Math.cos(lt*77)*10*sh)+"px) scale("+z+")"}
  else o.cam.style.transform="scale("+z+")";
  if(o.tiles.length){o.svh.style.opacity=cl(lt/.3);o.svh.style.transform="translateY("+(-40*(1-oc(lt/.4)))+"px)";
    o.tiles.forEach(function(t,k){var p=(lt-.08-k*.045)/.4,on=lt>=+t.dataset.t;t.classList.toggle("on",on);
      var pulse=on?Math.max(0,1-(lt-(+t.dataset.t))/.35):0;t.style.opacity=cl(p*1.5);t.style.transform="translateY("+(60*(1-oc(p)))+"px) scale("+((.8+.2*ob(p))*(1+.07*pulse))+")"});}
  if(o.ico){o.ico.style.transform="translateY("+(Math.sin(lt*2.2)*10)+"px) scale("+(.55+.45*ob(lt/.5))+")";o.ico.style.opacity=cl(lt/.2);
    o.paths.forEach(function(p,k){p.style.strokeDashoffset=String(1-oc((lt-.12-k*.05)/.7))});
    o.rings.forEach(function(r,k){var c=((lt+k*.7)%1.4)/1.4;r.style.transform="scale("+(1+.55*c)+")";r.style.opacity=String((1-c)*.7*cl(lt/.4))})}
  var nw=o.words.length;
  var ch=$(".chip",o.el);if(ch){ch.style.opacity=cl((lt-.05)/.2);ch.style.transform="translateX(-50%) translateY("+(-30*(1-oc(lt/.3)))+"px)"}
  var st=cur===0?-.12:.14,sg=cur===0?.06:.085;
  o.words.forEach(function(w,k){var p=(lt-st-k*sg)/.34;w.style.opacity=cl(p*1.6);w.style.transform="translateY("+(70*(1-oc(p)))+"px) scale("+(.82+.18*ob(p))+")"});
  o.hls.forEach(function(h){h.style.transform="scaleX("+oc((lt-st-.06-nw*sg)/.3)+")"});
  var ws=s.words||[];o.cap.style.opacity=ws.length?cl((lt-.05)/.2):0;
  var isK=o.el.classList.contains("kar"),act=0,cst=0;
  if(isK){for(var q=0;q<ws.length;q++){if(lt>=ws[q].s-.06){act=+o.cws[q].dataset.c;}}
    for(var q2=0;q2<ws.length;q2++){if(+o.cws[q2].dataset.c===act){cst=ws[q2].s;break}}
    var pp=oc((lt-cst+.06)/.18);o.cap.style.transform="translateY("+(18*(1-pp))+"px) scale("+(.94+.06*pp)+")";o.cap.style.opacity=ws.length?1:0}
  o.cws.forEach(function(c,k){var w=ws[k];c.className="cw"+(lt>=w.s&&lt<w.e+.05?" on":lt>=w.e?" past":"")+(isK&&+c.dataset.c===act?" vis":"")});
  if(o.card){o.card.style.transform="translateY("+(160*(1-oc(lt/.5)))+"px) scale("+(.9+.1*oc(lt/.5))+")";o.card.style.opacity=cl(lt/.3);
    o.rows.forEach(function(r,k){var p=(lt-.2-k*.12)/.35;r.style.opacity=cl(p);r.style.transform="translateX("+(-50*(1-oc(p)))+"px)"});
    var bx=o.btn.offsetLeft+o.btn.offsetWidth*.32,by=o.btn.offsetTop+o.btn.offsetHeight*.5;
    var mp=io((lt-.75)/.55);o.ptr.style.opacity=cl((lt-.7)/.15)*(lt<2.1?1:cl(1-(lt-2.1)/.3));
    o.ptr.style.transform="translate("+(bx+260*(1-mp)-43)+"px,"+(by+300*(1-mp)-43)+"px) scale("+(lt>1.32&&lt<1.45?.82:1)+")";
    var tp=(lt-1.38)/.5;o.rip.style.opacity=tp>0&&tp<1?String(1-tp):"0";o.rip.style.transform="translate("+(bx-30)+"px,"+(by-30)+"px) scale("+(1+3*cl(tp))+")";
    var done=lt>1.45;o.btn.style.background=done?"linear-gradient(90deg,#1f9d63,#3ee08f)":"";o.b1.style.opacity=done?0:1;o.b2.style.opacity=done?1:0;
    o.btn.style.transform="scale("+(lt>1.32&&lt<1.5?.96:1)+")"}
}
function fit(){S.forEach(function(o){var h=$("h1",o.el);if(!h||o.el.classList.contains("kar"))return;o.el.style.display="block";
  var fs=parseFloat(getComputedStyle(h).fontSize),max=o.card?200:340,lim=o.card?1280:1250;
  while((h.offsetHeight>max||h.offsetTop+h.offsetHeight>lim)&&fs>54){fs-=4;h.style.fontSize=fs+"px"}
  var top=Math.max(o.card?1330:1290,h.offsetTop+h.offsetHeight+36);o.cap.style.top=top+"px";
  var cf=parseFloat(getComputedStyle(o.cap).fontSize);while(top+o.cap.offsetHeight>1560&&cf>32){cf-=3;o.cap.style.fontSize=cf+"px"}
  o.el.style.display="none"})}
window.render=render;window.fit=fit;
</script></body></html>`;
}

function run(args) {
  return new Promise((res, rej) => spawn("ffmpeg", ["-y", "-loglevel", "error"].concat(args), { stdio: ["ignore", "inherit", "inherit"] })
    .on("close", c => c === 0 ? res() : rej(new Error("ffmpeg " + c))));
}

async function buildBackground(tl) {
  const marks = tl.scenes.map((s, i) => i === 0 ? 0 : s.start).concat([tl.total]);
  const list = [];
  for (let i = 0; i < tl.scenes.length; i++) {
    const a = Math.round(marks[i] * FPS), b = i === tl.scenes.length - 1 ? Math.ceil(tl.total * FPS) : Math.round(marks[i + 1] * FPS);
    const n = Math.max(b - a, 1), D = (n / FPS).toFixed(2);
    const seg = path.join(OUT, "seg" + i + ".mp4");
    const vid = path.join(OUT, "bg" + i + ".mp4"), img = path.join(OUT, "bg" + i + ".jpg");
    const src = fs.existsSync(vid) ? vid : img;
    const input = src === img ? ["-loop", "1", "-framerate", String(FPS), "-i", src] : ["-stream_loop", "-1", "-i", src];
    const enc = ["-frames:v", String(n), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", seg];
    if (tl.fx[i]) {
      await run(input.concat(["-vf",
        "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=" + FPS +
        ",scale=w='trunc(1080*(1+" + (src === img ? "0.12" : "0.08") + "*t/" + D + ")/2)*2':h=-2:eval=frame,crop=1080:1920,eq=contrast=1.06:saturation=1.1,setsar=1"]).concat(enc));
    } else {
      await run(["-f", "lavfi", "-i", "color=c=0x041f1d:s=1080x1920:r=" + FPS].concat(enc));
    }
    list.push("file '" + seg + "'");
  }
  const lst = path.join(OUT, "segs.txt");
  fs.writeFileSync(lst, list.join("\n") + "\n");
  const bg = path.join(OUT, "bg.mp4");
  await run(["-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", bg]);
  return bg;
}

async function main() {
  const tl = JSON.parse(fs.readFileSync(path.join(OUT, "timeline.json"), "utf8"));
  tl.fx = tl.scenes.map((s, i) => i < tl.scenes.length - 1 && (fs.existsSync(path.join(OUT, "bg" + i + ".mp4")) || fs.existsSync(path.join(OUT, "bg" + i + ".jpg"))));
  const anyFx = tl.fx.some(Boolean);
  let bg = null;
  if (anyFx) {
    try { bg = await buildBackground(tl); log("لقطات حقيقية: " + tl.fx.filter(Boolean).length + " مشاهد"); }
    catch (e) { log("تعذر تجهيز اللقطات: " + e.message); tl.fx = tl.fx.map(() => false); }
  }
  const html = path.join(OUT, "reel.html");
  fs.writeFileSync(html, page(tl), "utf8");
  const pw = loadPW();
  const exe = findChrome();
  const browser = await pw.chromium.launch(exe ? { executablePath: exe, args: ["--allow-file-access-from-files", "--no-sandbox"] } : { channel: "chrome" });
  const frames = Math.ceil(tl.total * FPS);
  const W = Math.max(1, Math.min(+process.env.RENDER_WORKERS || Math.max(1, require("os").cpus().length - 1), 4));
  const per = Math.ceil(frames / W);
  const t0 = Date.now();
  let done = 0;
  async function chunk(k) {
    const f0 = k * per, f1 = Math.min(frames, f0 + per);
    if (f1 <= f0) return null;
    const pg = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
    await pg.goto("file://" + html, { waitUntil: "load", timeout: 60000 }).catch(() => {});
    await pg.evaluate(() => Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 6000))]));
    await pg.evaluate(() => window.fit());
    const out = path.join(OUT, "part" + k + ".mp4");
    const enc = ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(FPS), "-frames:v", String(f1 - f0), out];
    const args = bg
      ? ["-y", "-loglevel", "error", "-ss", (f0 / FPS).toFixed(4), "-i", bg, "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
         "-filter_complex", "[0:v][1:v]overlay=0:0:format=auto,format=yuv420p"].concat(enc)
      : ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-"].concat(enc);
    const ff = spawn("ffmpeg", args, { stdio: ["pipe", "inherit", "inherit"] });
    const closed = new Promise((res, rej) => ff.on("close", c => c === 0 ? res() : rej(new Error("ffmpeg " + c))));
    for (let f = f0; f < f1; f++) {
      await pg.evaluate(x => window.render(x), f / FPS);
      const buf = bg ? await pg.screenshot({ type: "png", omitBackground: true }) : await pg.screenshot({ type: "jpeg", quality: 92 });
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once("drain", r));
      if (++done % 150 === 0) log("إطار " + done + "/" + frames);
    }
    ff.stdin.end();
    await closed;
    await pg.close();
    return out;
  }
  const parts = (await Promise.all(Array.from({ length: W }, (_, k) => chunk(k)))).filter(Boolean);
  await browser.close();
  log("الرسم استغرق " + Math.round((Date.now() - t0) / 1000) + " ث (" + W + " مسارات متوازية)");
  const silent = path.join(OUT, "video.mp4");
  const lst = path.join(OUT, "parts.txt");
  fs.writeFileSync(lst, parts.map(p => "file '" + p + "'").join("\n") + "\n");
  await run(["-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", silent]);
  const mix = path.join(OUT, "mix.wav");
  const final = path.join(OUT, "reel.mp4");
  const margs = ["-i", silent];
  if (fs.existsSync(mix)) margs.push("-i", mix, "-c:a", "aac", "-b:a", "192k", "-shortest");
  margs.push("-c:v", "copy", "-movflags", "+faststart", final);
  await run(margs);
  await run(["-ss", (tl.scenes[0].start + 1.0).toFixed(2), "-i", final, "-frames:v", "1", "-q:v", "3", path.join(OUT, "cover.jpg")]);
  log("تم: " + final + " (" + tl.total.toFixed(1) + " ث، المحرك الصوتي: " + (tl.engine || "?") + ")");
}

main().catch(e => { console.error(e); process.exit(1); });
