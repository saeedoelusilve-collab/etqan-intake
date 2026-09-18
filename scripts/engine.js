const fs = require("fs");
const path = require("path");

const BASE = "https://saeedoelusilve-collab.github.io/etqan-intake";
const PORTAL = BASE + "/index.html";
const ROOT = process.cwd();
const PLAN = path.join(ROOT, "scripts", "plan.json");

const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
const INDEXNOW_KEY = process.env.INDEXNOW_KEY || "";
const MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-flash-latest",
  "gemini-1.5-flash"
];

function log(m) { console.log("[المحرك] " + m); }

function loadPlan() {
  if (!fs.existsSync(PLAN)) {
    console.error("ملف الخطة غير موجود: scripts/plan.json");
    process.exit(0);
  }
  return JSON.parse(fs.readFileSync(PLAN, "utf8"));
}

async function listModels() {
  if (!GEMINI_KEY) return [];
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?key=" + GEMINI_KEY);
    if (!r.ok) { log("تعذر جلب قائمة النماذج: " + r.status); return []; }
    const j = await r.json();
    const names = (j.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map(m => m.name.replace("models/", ""));
    log("النماذج المتاحة: " + names.slice(0, 8).join(", "));
    return names;
  } catch (e) { return []; }
}

async function tryModel(model, prompt) {
  const url = "https://generativelanguage.googleapis.com/v1beta/models/"
    + model + ":generateContent?key=" + GEMINI_KEY;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.75, maxOutputTokens: 2400 }
    })
  });
  if (!res.ok) { log(model + " ← " + res.status); return null; }
  const j = await res.json();
  let t = j.candidates?.[0]?.content?.parts?.[0]?.text || "";
  t = t.replace(/```json/g, "").replace(/```/g, "").trim();
  try { return JSON.parse(t); } catch (e) { log(model + " ← رد غير صالح"); return null; }
}

async function askGemini(prompt) {
  if (!GEMINI_KEY) { log("لا يوجد مفتاح — تخطٍ"); return null; }
  const available = await listModels();
  const candidates = MODELS.filter(m => available.length === 0 || available.includes(m));
  const list = candidates.length ? candidates : available.filter(n => n.indexOf("flash") !== -1).slice(0, 3);
  if (!list.length) { log("لا يوجد نموذج صالح"); return null; }
  for (const m of list) {
    log("تجربة النموذج: " + m);
    try {
      const out = await tryModel(m, prompt);
      if (out && out.title) { log("نجح النموذج: " + m); return out; }
    } catch (e) { log(m + " ← " + e.message); }
  }
  log("فشلت كل النماذج");
  return null;
}

function buildPrompt(item) {
  return `اكتب محتوى صفحة عربية احترافية لشبكة فنّيين اسمها "المنجز" في المدينة المنورة بالسعودية.

الموضوع: ${item.topic}
التخصص: ${item.trade}
${item.district ? "الحي: " + item.district : ""}

اكتب بأسلوب عملي واضح يخاطب صاحب البيت أو المقاول مباشرة، بلا مبالغة تسويقية وبلا وعود بأسعار محددة.
المحتوى يجب أن يكون مفيداً فعلاً — معلومات يستفيد منها القارئ حتى لو لم يطلب الخدمة.

أعد JSON فقط بلا أي نص آخر وبلا علامات كود، بهذا الشكل:
{
 "title": "عنوان الصفحة، 8 كلمات كحد أقصى، يتضمن المدينة المنورة",
 "meta": "وصف للبحث، 140 حرفاً كحد أقصى",
 "h1": "عنوان رئيسي جذاب",
 "intro": "فقرة افتتاحية من 3 إلى 4 جمل",
 "sections": [
   {"h": "عنوان فرعي", "p": "فقرة من 3 إلى 5 جمل"},
   {"h": "عنوان فرعي", "p": "فقرة من 3 إلى 5 جمل"},
   {"h": "عنوان فرعي", "p": "فقرة من 3 إلى 5 جمل"},
   {"h": "عنوان فرعي", "p": "فقرة من 3 إلى 5 جمل"}
 ],
 "tips": ["نصيحة عملية", "نصيحة عملية", "نصيحة عملية", "نصيحة عملية"],
 "faq": [
   {"q": "سؤال يطرحه الناس فعلاً", "a": "إجابة واضحة من جملتين إلى ثلاث"},
   {"q": "سؤال", "a": "إجابة"},
   {"q": "سؤال", "a": "إجابة"}
 ]
}

مهم: لا تذكر أسعاراً بالريال، تحدث عن العوامل التي تحدد التكلفة بدل الأرقام.`;
}

function render(c, item) {
  const esc = s => String(s || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const sections = (c.sections || []).map(s =>
    `<h2>${esc(s.h)}</h2><div class="box"><p>${esc(s.p)}</p></div>`).join("\n");
  const tips = (c.tips || []).map(t => `<li>${esc(t)}</li>`).join("");
  const faqHtml = (c.faq || []).map(f =>
    `<div class="box"><h3>${esc(f.q)}</h3><p>${esc(f.a)}</p></div>`).join("");
  const faqLd = {
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: (c.faq || []).map(f => ({
      "@type": "Question", name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a }
    }))
  };

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(c.title)} | المنجز</title>
<meta name="description" content="${esc(c.meta)}" />
<link rel="canonical" href="${BASE}/${item.slug}.html" />
<link rel="icon" href="./logo.png" />
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap" rel="stylesheet" />
<script type="application/ld+json">${JSON.stringify(faqLd)}</script>
<style>
:root{--p:#0e4c4a;--pd:#08302e;--pg:#167f79;--tint:#e9f2f1;--bg:#f5f4f0;--ink:#16201f;--mut:#62706e;--line:#e4e1d9;--gold:#c69541}
*{box-sizing:border-box}body{margin:0;font-family:"IBM Plex Sans Arabic",system-ui,sans-serif;background:var(--bg);color:var(--ink);line-height:1.8}
.w{max-width:600px;margin:0 auto;padding:0 16px 40px}
header{background:radial-gradient(130% 90% at 88% -20%,var(--pg),var(--p) 42%,var(--pd));color:#fff;padding:26px 20px 34px;border-radius:0 0 26px 26px}
.bl{display:flex;align-items:center;gap:10px;margin-bottom:16px}
.bl img{width:42px;height:42px;border-radius:12px}
.bn{font-weight:700;font-size:17px}.bs{font-size:11px;opacity:.82}
h1{font-size:23px;line-height:1.4;margin:6px 0 10px}
.lead{font-size:15px;opacity:.93;margin:0}
.cta{display:block;text-align:center;background:var(--p);color:#fff;text-decoration:none;font-weight:700;font-size:17px;padding:16px;border-radius:13px;margin:22px 0;box-shadow:0 6px 18px rgba(14,76,74,.22)}
.cta.g{background:#1f8a4c}
h2{font-size:19px;margin:26px 0 12px;display:flex;align-items:center;gap:8px}
h2::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--gold)}
.box{background:#fff;border:1px solid var(--line);border-radius:13px;padding:14px 16px;margin-bottom:10px}
.box h3{margin:0 0 5px;font-size:15.5px;color:var(--pd)}
.box p{margin:0;font-size:14.5px;color:var(--mut)}
ul{background:#fff;border:1px solid var(--line);border-radius:13px;padding:14px 32px 14px 16px;font-size:14.5px}
li{margin-bottom:7px}
footer{text-align:center;color:var(--mut);font-size:12px;margin-top:26px}
footer a{color:var(--mut)}
</style>
</head>
<body>
<header><div class="w">
<div class="bl"><img src="./logo.png" alt="المنجز" /><div><div class="bn">المنجز</div><div class="bs">شبكة فنّيين وعمالة — المدينة المنورة</div></div></div>
<h1>${esc(c.h1)}</h1>
<p class="lead">${esc(c.intro)}</p>
</div></header>
<div class="w">
<a class="cta" href="${PORTAL}">اطلب ${esc(item.trade)} الآن</a>
${sections}
<h2>نصائح عملية</h2>
<ul>${tips}</ul>
<h2>أسئلة شائعة</h2>
${faqHtml}
<a class="cta g" href="${PORTAL}">اطلب ${esc(item.trade)} — مجاناً</a>
<footer><a href="./home.html">المنجز</a> — شبكة فنّيين وعمالة بالمدينة المنورة</footer>
</div>
</body>
</html>`;
}

function updateSitemap(newSlug) {
  const p = path.join(ROOT, "sitemap.xml");
  if (!fs.existsSync(p)) return;
  let s = fs.readFileSync(p, "utf8");
  const loc = `${BASE}/${newSlug}.html`;
  if (s.includes(loc)) return;
  s = s.replace("</urlset>",
    `  <url><loc>${loc}</loc><priority>0.7</priority></url>\n</urlset>`);
  fs.writeFileSync(p, s, "utf8");
  log("خريطة الموقع محدّثة");
}

async function pingIndexNow(slug) {
  if (!INDEXNOW_KEY) { log("لا يوجد مفتاح IndexNow — تخطٍ"); return; }
  const url = `https://api.indexnow.org/indexnow?url=${encodeURIComponent(BASE + "/" + slug + ".html")}&key=${INDEXNOW_KEY}`;
  try {
    const r = await fetch(url);
    log("IndexNow: " + r.status);
  } catch (e) {
    log("فشل IndexNow: " + e.message);
  }
}

(async function main() {
  const plan = loadPlan();
  const next = plan.find(x => !x.done);
  if (!next) { log("انتهت الخطة — أضف مواضيع جديدة"); return; }

  log("الموضوع: " + next.topic);
  const content = await askGemini(buildPrompt(next));
  if (!content || !content.title) { log("فشل التوليد — سنحاول لاحقاً"); return; }

  const html = render(content, next);
  fs.writeFileSync(path.join(ROOT, next.slug + ".html"), html, "utf8");
  log("تم إنشاء: " + next.slug + ".html");

  updateSitemap(next.slug);
  await pingIndexNow(next.slug);

  next.done = true;
  next.publishedAt = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(PLAN, JSON.stringify(plan, null, 2), "utf8");
  log("اكتمل النشر");
})();
