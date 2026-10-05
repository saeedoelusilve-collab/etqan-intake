const fs = require("fs");
const path = require("path");

const SITE = "https://saeedoelusilve-collab.github.io/etqan-intake/home.html";
const ROOT = process.cwd();
const OUT = path.join(ROOT, "social");
const ARCHIVE = path.join(OUT, "archive");
const KEY = process.env.GEMINI_API_KEY || "";
const MODELS = ["gemini-flash-lite-latest", "gemini-flash-latest", "gemini-2.5-flash"];
const VERSIONS = ["v1beta", "v1"];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = m => console.log("[المحتوى] " + m);

const TRADES = ["سباكة", "كهرباء", "تكييف", "أجهزة كهربائية", "نجارة", "تبليط", "دهان", "جبس بورد", "سمنت بورد", "حدادة", "بناء ولياسة"];

const TYPES = {
  6: { name: "نصيحة عملية", audience: "أصحاب البيوت", brief: "نصيحة واحدة واضحة ومفيدة فوراً لصاحب البيت" },
  0: { name: "علامات تحذيرية", audience: "أصحاب البيوت", brief: "3 أو 4 علامات مبكرة تدل على مشكلة قادمة يجب ألا تُتجاهل" },
  1: { name: "الفنادق والشقق المفروشة", audience: "ملاك الفنادق والشقق الفندقية والمفروشة ومكاتب العقار", brief: "خاطبهم بلغة الخسارة والإيراد: الغرفة المعطلة تخسر إيرادها اليومي وتجلب تقييماً سيئاً، والمنجز يوفر لهم فنيين في كل التخصصات برقم واحد" },
  2: { name: "دليل طوارئ", audience: "أصحاب البيوت", brief: "خطوات مرقمة لأول دقائق عند عطل طارئ قبل وصول الفني" },
  3: { name: "خرافة وحقيقة", audience: "أصحاب البيوت", brief: "اعتقاد شائع خاطئ عن الصيانة وتصحيحه بوضوح" },
  4: { name: "المقاولون والمشاريع", audience: "المقاولون وأصحاب مشاريع التشطيب", brief: "عمالة تشطيب متخصصة جاهزة، وترتيب مراحل التشطيب الصحيح لتجنب إعادة العمل" },
  5: { name: "سؤال تفاعلي", audience: "الجميع", brief: "سؤال خفيف يشجع التعليق والمشاركة، بلا بيع مباشر، بأسلوب هادئ يليق بيوم الجمعة" }
};

function riyadhParts(d) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" });
  const p = {};
  f.formatToParts(d).forEach(x => { p[x.type] = x.value; });
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday];
  return { y: +p.year, m: +p.month, d: +p.day, wd: wd, iso: p.year + "-" + p.month + "-" + p.day };
}

function hijri(d) {
  try {
    const f = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { timeZone: "Asia/Riyadh", day: "numeric", month: "long", year: "numeric" });
    const n = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { timeZone: "Asia/Riyadh", month: "numeric" });
    const month = +n.formatToParts(d).find(x => x.type === "month").value;
    return { text: f.format(d), month: month };
  } catch (e) { return { text: "", month: 0 }; }
}

function seasonByMonth(m) {
  if (m >= 6 && m <= 9) return "صيف المدينة الحارق: ضغط شديد على المكيفات والكهرباء، القواطع تفصل من الأحمال، وخزانات الماء تسخن";
  if (m === 10 || m === 11) return "نهاية الصيف: وقت صيانة المكيفات وغسيلها بعد موسم التشغيل الطويل، وفحص السخانات قبل البرد";
  if (m === 12 || m <= 2) return "الشتاء المعتدل: موسم مثالي للتشطيب والدهان، وفحص عزل الأسطح من تسربات الأمطار، وتشغيل السخانات";
  return "ما قبل الصيف: أفضل وقت لصيانة المكيفات قبل الذروة، وموسم مناسب للدهان والتشطيب";
}

function seasonByHijri(h) {
  const map = {
    8: "شهر شعبان: الاستعداد لرمضان — تجهيز البيوت، وتجهيز الفنادق والشقق المفروشة لموسم عمرة رمضان المزدحم",
    9: "شهر رمضان: ذروة الزوار في المدينة، والفنادق ممتلئة، والأعطال الطارئة لا تحتمل التأخير",
    10: "شهر شوال: بعد موسم رمضان — وقت مثالي لصيانة الفنادق والشقق بعد الضغط، وموسم تجديد للبيوت",
    11: "ذو القعدة: الاستعداد لموسم الحج وزوار المدينة قبل الحج وبعده",
    12: "ذو الحجة: موسم الحج وزوار المدينة — ضغط كبير على الفنادق والشقق الفندقية",
    1: "محرم: بداية موسم العمرة الجديد — الفنادق والشقق تستعد لاستقبال المعتمرين"
  };
  return map[h] || "";
}

function dayOfYear(p) {
  const start = Date.UTC(p.y, 0, 1);
  const now = Date.UTC(p.y, p.m - 1, p.d);
  return Math.floor((now - start) / 86400000);
}

function buildPrompt(ctx) {
  return `أنت مسوّق محترف لـ"المنجز" — شبكة فنّيين وعمالة في المدينة المنورة (سباكة، كهرباء، تكييف، أجهزة، نجارة، تبليط، دهان، جبس بورد، سمنت بورد، حدادة، بناء). الطلب مجاني عبر رابط في البايو، والفني يتواصل مع العميل مباشرة.

اكتب محتوى اليوم:
- نوع المحتوى: ${ctx.type.name}
- الجمهور: ${ctx.type.audience}
- الفكرة: ${ctx.type.brief}
- تخصص اليوم: ${ctx.trade}
- الموسم الحالي: ${ctx.season}
${ctx.hijriSeason ? "- مناسبة الشهر الهجري: " + ctx.hijriSeason : ""}

حقائق عامة يمكنك استخدامها عند الحاجة فقط (من بيانات وزارة السياحة 2026): المدينة المنورة فيها أكثر من 80 ألف غرفة فندقية مرخصة، ومعدل إشغال الضيافة فيها 82% وهو الأعلى في المملكة، ومتوسط سعر الليلة نحو 453 ريالاً.

قواعد صارمة:
- عربية واضحة قريبة من اللهجة السعودية البيضاء، بلا مبالغة ولا تهويل.
- لا تذكر أسعار خدمات بالريال، ولا مدة وصول محددة، ولا أي رقم أو إحصائية غير الحقائق أعلاه.
- لا تكتب أي رابط؛ سيُضاف تلقائياً.
- اربط المحتوى بالموسم الحالي إن كان مناسباً.

أعد JSON فقط بلا أي نص آخر وبلا علامات كود:
{
 "topic": "موضوع اليوم في سطر واحد",
 "snap": ["إطار ستوري أول قصير جذاب", "إطار ثانٍ", "إطار ثالث يدعو للطلب"],
 "facebook": "منشور فيسبوك من 5 إلى 8 أسطر، استخدم \\n بين الأسطر",
 "tiktok_slides": ["شريحة 1 عنوان يوقف التمرير", "شريحة 2", "شريحة 3", "شريحة 4 دعوة للطلب"],
 "tiktok_caption": "تعليق تيك توك من سطرين",
 "whatsapp": "حالة واتساب من 3 أسطر، استخدم \\n بين الأسطر",
 "haraj_title": "عنوان إعلان حراج لا يتجاوز 60 حرفاً ويحتوي المدينة المنورة",
 "hashtags": ["#المدينة_المنورة", "#المنجز", "هاشتاق 3", "هاشتاق 4", "هاشتاق 5"]
}`;
}

async function callModel(model, prompt) {
  for (const ver of VERSIONS) {
    const url = "https://generativelanguage.googleapis.com/" + ver + "/models/" + model + ":generateContent?key=" + KEY;
    for (let attempt = 1; attempt <= 3; attempt++) {
      let res;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.85, maxOutputTokens: 2000 } })
        });
      } catch (e) { log(model + " شبكة: " + e.message); break; }
      if (res.status === 503 || res.status === 429) { log(model + " مشغول، محاولة " + attempt); await sleep(6000 * attempt); continue; }
      if (!res.ok) { log(model + " " + ver + " ← " + res.status); break; }
      const j = await res.json();
      let t = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts[0].text) || "";
      t = t.replace(/```json/g, "").replace(/```/g, "").trim();
      try { return JSON.parse(t); } catch (e) { log(model + " رد غير صالح"); break; }
    }
  }
  return null;
}

async function generate(prompt) {
  if (process.env.MOCK) {
    return {
      topic: "فلتر المكيف بعد صيف طويل",
      snap: ["صيف كامل والمكيف شغال؟", "الفلتر الحين مسدود بالغبار", "نظّفه أو اطلب فني تكييف"],
      facebook: "بعد صيف المدينة الطويل، فلتر مكيفك غالباً مليان غبار.\nالفلتر المسدود يضعف التبريد ويرفع الفاتورة.\nنظّفه بنفسك أو خل الفني يغسل المكيف كامل.",
      tiktok_slides: ["مكيفك صار ضعيف؟", "السبب غالباً الفلتر", "غسيل بعد الصيف يرجّع كفاءته", "اطلب فني تكييف من المنجز"],
      tiktok_caption: "غسيل المكيف بعد الصيف مو رفاهية ❄️",
      whatsapp: "❄️ المكيف ضعف بعد الصيف؟\nغسيل وصيانة من فنيي المنجز\nاطلب الحين 👇",
      haraj_title: "غسيل وصيانة مكيفات المدينة المنورة | المنجز",
      hashtags: ["#المدينة_المنورة", "#المنجز", "#تكييف", "#صيانة_مكيفات", "#صيانة_منزلية"]
    };
  }
  if (!KEY) { log("لا يوجد مفتاح Gemini"); return null; }
  for (const m of MODELS) {
    log("تجربة النموذج: " + m);
    const out = await callModel(m, prompt);
    if (out && out.topic && out.facebook) { log("نجح: " + m); return out; }
  }
  return null;
}

const esc = s => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function block(title, icon, text) {
  return `<div class="card"><div class="ch"><span>${icon} ${title}</span><button onclick="cp(this)">نسخ</button></div><pre>${esc(text)}</pre></div>`;
}

function render(c, ctx) {
  const tags = (c.hashtags || []).join(" ");
  const snap = (c.snap || []).map((s, i) => "إطار " + (i + 1) + ": " + s).join("\n\n") + "\n\n🔗 " + SITE;
  const fb = String(c.facebook || "").replace(/\\n/g, "\n") + "\n\n👇 اطلب فنيّك من هنا:\n" + SITE + "\n\n" + tags;
  const tt = (c.tiktok_slides || []).map((s, i) => "شريحة " + (i + 1) + ": " + s).join("\n");
  const ttCap = String(c.tiktok_caption || "") + "\nالرابط في البايو 🔗\n" + tags;
  const wa = String(c.whatsapp || "").replace(/\\n/g, "\n") + "\n" + SITE;
  const haraj = String(c.haraj_title || "");

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>محتوى اليوم — المنجز</title>
<link rel="icon" href="../logo.png">
<style>
:root{--p:#0e4c4a;--pd:#08302e;--gold:#c69541;--bg:#f5f4f0;--line:#e4e1d9;--mut:#62706e}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,"Segoe UI",Tahoma,sans-serif;background:var(--bg);color:#16201f;line-height:1.7}
header{background:linear-gradient(140deg,#167f79,var(--p) 45%,var(--pd));color:#fff;padding:20px 18px 24px;border-radius:0 0 22px 22px}
.w{max-width:600px;margin:0 auto;padding:0 14px 40px}
h1{font-size:20px;margin:0 0 4px}.sub{font-size:12.5px;opacity:.85}
.topic{background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.25);border-radius:12px;padding:10px 12px;margin-top:14px;font-weight:700}
.meta{font-size:12px;opacity:.85;margin-top:8px}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;margin-top:14px;overflow:hidden}
.ch{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#fafaf8;border-bottom:1px solid var(--line);font-weight:700;font-size:14.5px}
.ch button{border:0;background:var(--p);color:#fff;border-radius:9px;padding:7px 16px;font:inherit;font-size:13px;font-weight:700}
.ch button.ok{background:#1c7a44}
pre{margin:0;padding:14px;white-space:pre-wrap;word-wrap:break-word;font-family:inherit;font-size:14.5px}
.tip{background:#fff8e6;border:1px solid #f0dfae;border-radius:12px;padding:12px 14px;margin-top:14px;font-size:13px}
</style></head><body>
<header><div class="w" style="padding-bottom:0">
<h1>محتوى اليوم — المنجز</h1>
<div class="sub">${esc(ctx.iso)} · ${esc(ctx.hijriText)} · ${esc(ctx.type.name)}</div>
<div class="topic">${esc(c.topic)}</div>
<div class="meta">🛠️ ${esc(ctx.trade)} · 🎯 ${esc(ctx.type.audience)}</div>
</div></header>
<div class="w">
${block("ستوري سناب", "👻", snap)}
${block("منشور فيسبوك", "📘", fb)}
${block("تيك توك — نص الشرائح", "🎵", tt)}
${block("تيك توك — التعليق", "✍️", ttCap)}
${block("حالة واتساب", "💬", wa)}
${block("عنوان حراج (للتحديث)", "🏷️", haraj)}
<div class="tip"><b>طريقة الاستخدام:</b> اضغط «نسخ» والصق في المنصة. لشرائح تيك توك، استخدم صفحة التصاميم <b>posts_visual</b> أو اكتب كل شريحة على صورة. المحتوى يتجدد تلقائياً كل صباح.</div>
</div>
<script>
function cp(b){var t=b.parentNode.parentNode.querySelector("pre").innerText;
function done(){b.textContent="✓ تم";b.className="ok";setTimeout(function(){b.textContent="نسخ";b.className="";},1600);}
if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(done,function(){fb(t);done();});}else{fb(t);done();}}
function fb(t){var a=document.createElement("textarea");a.value=t;document.body.appendChild(a);a.select();try{document.execCommand("copy");}catch(e){}document.body.removeChild(a);}
</script>
</body></html>`;
}

(async function main() {
  const now = new Date();
  const p = riyadhParts(now);
  const h = hijri(now);
  const ctx = {
    iso: p.iso,
    hijriText: h.text,
    type: TYPES[p.wd],
    trade: TRADES[dayOfYear(p) % TRADES.length],
    season: seasonByMonth(p.m),
    hijriSeason: seasonByHijri(h.month)
  };
  log("اليوم: " + ctx.iso + " | " + ctx.type.name + " | " + ctx.trade);
  if (ctx.hijriSeason) log("مناسبة: " + ctx.hijriSeason);

  const c = await generate(buildPrompt(ctx));
  if (!c) { log("فشل التوليد — يبقى محتوى الأمس، وسنحاول غداً"); return; }

  if (!fs.existsSync(ARCHIVE)) fs.mkdirSync(ARCHIVE, { recursive: true });
  const html = render(c, ctx);
  fs.writeFileSync(path.join(OUT, "today.html"), html, "utf8");
  fs.writeFileSync(path.join(ARCHIVE, ctx.iso + ".html"), html.replace(/\.\.\/logo\.png/g, "../../logo.png"), "utf8");
  log("تم: social/today.html");
})();
