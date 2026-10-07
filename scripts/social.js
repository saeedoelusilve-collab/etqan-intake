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


const HOOKS = [
  { n: "الخسارة الخفية", t: "ابدأ بخسارة مالية أو إزعاج يحدث لصاحب البيت دون أن يشعر، بجملة قصيرة تجعله يتوقف" },
  { n: "الخطأ الشائع", t: "ابدأ بـ«لا تسوي كذا» أو «غلطة يسويها أغلب الناس» ثم اكشف الصواب" },
  { n: "سؤال يستفز الفضول", t: "ابدأ بسؤال من 6 كلمات أو أقل لا يملك القارئ إلا أن يجيب عليه في رأسه" },
  { n: "لقطة موقف", t: "ابدأ بمشهد من الحياة اليومية في سطر واحد (الساعة ٢ فجراً.. المكيف وقف..)" },
  { n: "قبل وبعد", t: "قارن بين من تجاهل المشكلة ومن عالجها مبكراً في جملتين متقابلتين" },
  { n: "الرقم الصادم", t: "ابدأ بحقيقة عامة مؤكدة أو وصف كمي بلا اختلاق أرقام (مثل: ثانية واحدة، غرفة واحدة، ليلة واحدة)" }
];

const FRAMEWORKS = {
  6: "PAS: المشكلة ثم تعميقها ثم الحل",
  0: "AIDA: انتباه، اهتمام، رغبة، فعل",
  1: "BAB: الوضع الحالي المكلف، ثم الوضع المطلوب، ثم الجسر (المنجز)",
  2: "خطوات مرقمة قصيرة تنتهي بدعوة واضحة",
  3: "خرافة ثم الحقيقة ثم دليل بسيط ثم دعوة",
  4: "PAS موجّه للمقاول: ضياع الوقت وإعادة العمل ثم الحل",
  5: "سؤال بخيارين يسهل الرد عليه بكلمة، بلا بيع"
};

function occasion(p) {
  const now = Date.UTC(p.y, p.m - 1, p.d);
  const fixed = [
    { m: 2, d: 22, t: "يوم التأسيس" },
    { m: 9, d: 23, t: "اليوم الوطني السعودي" }
  ];
  for (const f of fixed) {
    for (const yr of [p.y, p.y + 1]) {
      const diff = Math.round((Date.UTC(yr, f.m - 1, f.d) - now) / 86400000);
      if (diff >= 0 && diff <= 10) return diff === 0 ? "اليوم هو " + f.t + " — اربط المحتوى بالفخر والبيت الجاهز للاحتفال" : "يقترب " + f.t + " بعد " + diff + " أيام — بيوت وواجهات جاهزة للاحتفال";
    }
  }
  if (p.m === 11 && p.d >= 18) return "موسم الجمعة البيضاء والتخفيضات — فرصة لتجهيز البيت وصيانته بميزانية ذكية";
  if (p.m === 8 && p.d >= 15 || p.m === 9 && p.d <= 5) return "العودة للمدارس — بيت مرتب وجاهز بعد الإجازة";
  return "";
}

function dayOfYear(p) {
  const start = Date.UTC(p.y, 0, 1);
  const now = Date.UTC(p.y, p.m - 1, p.d);
  return Math.floor((now - start) / 86400000);
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
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.85, maxOutputTokens: 3500 } })
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

const REPO = "saeedoelusilve-collab/etqan-intake";
const REEL_URL = "https://github.com/" + REPO + "/releases/download/daily-reel/reel.mp4";
const HISTORY = path.join(OUT, "history.json");

function loadHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY, "utf8")); } catch (e) { return []; }
}

function buildPrompt(ctx) {
  const recent = ctx.history.slice(-21).map(h => "- " + h.topic + " | " + (h.hook || "")).join("\n");
  return `أنت كاتب إعلانات سعودي محترف بمستوى حملات العلامات الكبرى، تعمل لـ"المنجز" — شبكة فنّيين وعمالة في المدينة المنورة (سباكة، كهرباء، تكييف، أجهزة، نجارة، تبليط، دهان، جبس بورد، سمنت بورد، حدادة، بناء). الطلب مجاني عبر رابط في البايو، والفني يتواصل مع العميل مباشرة.

مهمة اليوم:
- نوع المحتوى: ${ctx.type.name}
- الجمهور: ${ctx.type.audience}
- الفكرة: ${ctx.type.brief}
- تخصص اليوم: ${ctx.trade}
- الموسم: ${ctx.season}
${ctx.hijriSeason ? "- مناسبة هجرية: " + ctx.hijriSeason : ""}
${ctx.occ ? "- مناسبة وطنية/موسمية: " + ctx.occ : ""}
- إطار الكتابة: ${ctx.framework}
- أسلوب الخطاف المطلوب اليوم: «${ctx.hook.n}» — ${ctx.hook.t}

مواضيع وخطافات نُشرت مؤخراً (ممنوع تكرارها أو تشابهها):
${recent || "- لا يوجد"}

معايير الإعلان الاحترافي (مبنية على بيانات أداء المنصات):
1) أول 3 ثوانٍ تحسم كل شيء: الخطاف 8 كلمات أو أقل ويوقف التمرير.
2) فكرة واحدة فقط، وجملة واحدة لكل إطار أو مشهد.
3) تحدث عن ألم العميل أو النتيجة التي يريدها، لا عن "خدماتنا".
4) دعوة واحدة واضحة للفعل، تُقال بالصوت وتُكتب على الشاشة.
5) اكتب للجوال: أسطر قصيرة، كلمات بسيطة، إيموجي قليل.
6) الأسئلة ترفع التعليقات: اختم المنشور والتعليق الأول بسؤال سهل.
7) الفيديو: بنية مشكلة ← سبب ← حل ← دعوة، ومشهد جديد كل 2 إلى 4 ثوانٍ.
9) لكل مشهد اختر icon واحداً فقط من هذه القائمة: ac, drop, bolt, wrench, paint, tile, hammer, clock, alert, check, home, phone, plug, flame, thermo, fan, building, door, calendar, star. و key كلمة واحدة منسوخة حرفياً من text.
8) نص التعليق الصوتي بلهجة سعودية بيضاء طبيعية، كأن شخصاً يكلّم جاره، بلا لغة إعلانات متكلفة.

حقائق عامة تستعملها عند الحاجة فقط: المدينة المنورة فيها أكثر من 80 ألف غرفة فندقية مرخصة، ومعدل إشغال الضيافة 82% وهو الأعلى في المملكة، ومتوسط سعر الليلة نحو 453 ريالاً.

قواعد صارمة:
- بلا مبالغة ولا تهويل ولا وعود غير مضمونة.
- لا أسعار بالريال، ولا مدة وصول محددة، ولا إحصائية خارج الحقائق أعلاه.
- ممنوع اختلاق تقييمات أو شهادات عملاء أو قصص على أنها حقيقية.
- لا روابط. لا تقلّد إعلاناً أو شعاراً أو شخصية مشهورة.

أعد JSON فقط بلا أي نص آخر وبلا علامات كود:
{
 "topic": "موضوع اليوم في سطر",
 "hooks": ["الخطاف الرئيسي", "بديل 1", "بديل 2"],
 "reel": [
  {"text": "نص الشاشة للمشهد 1 = الخطاف (6 كلمات أو أقل)", "say": "ما يُقال بالصوت (12 كلمة أو أقل)", "icon": "رمز من القائمة", "key": "كلمة واحدة من text تُبرز بالذهبي"},
  {"text": "مشهد 2 المشكلة", "say": "...", "icon": "...", "key": "..."},
  {"text": "مشهد 3 السبب", "say": "...", "icon": "...", "key": "..."},
  {"text": "مشهد 4 الحل", "say": "...", "icon": "...", "key": "..."},
  {"text": "اطلب فنيّك مجاناً من المنجز", "say": "دعوة صوتية تنتهي بـ: الرابط في البايو", "icon": "phone", "key": "مجاناً"}
 ],
 "snap": ["إطار 1 هو الخطاف", "إطار 2", "إطار 3 دعوة للطلب"],
 "poll": "سؤال تصويت للستوري بخيارين، مثل: آخر غسيل لمكيفك؟ ◀ هذا العام / ما أذكر",
 "facebook": "منشور فيسبوك 5 إلى 8 أسطر، أول سطر هو الخطاف وآخر سطر سؤال، استخدم \\n بين الأسطر",
 "first_comment": "تعليق أول يثبّته صاحب الحساب وينتهي بسؤال",
 "tiktok_slides": ["شريحة 1 الخطاف (6 كلمات أو أقل)", "شريحة 2 (10 كلمات أو أقل)", "شريحة 3 (10 كلمات أو أقل)", "شريحة 4 دعوة: اطلب مجاناً من المنجز"],
 "tiktok_caption": "تعليق تيك توك من سطرين ينتهي بسؤال",
 "whatsapp": "حالة واتساب 3 أسطر، استخدم \\n بين الأسطر",
 "haraj_title": "عنوان حراج حتى 60 حرفاً فيه المدينة المنورة",
 "hashtags": ["#المدينة_المنورة", "#المنجز", "هاشتاق 3", "هاشتاق 4", "هاشتاق 5"]
}`;
}

function reviewPrompt(draft) {
  return `أنت مدير إبداعي صارم في وكالة إعلانات سعودية كبرى. أمامك مسودة محتوى يومي لـ"المنجز" (شبكة فنيين في المدينة المنورة، الطلب مجاني).

قيّم المسودة من 10 بهذه المعايير: قوة الخطاف في أول 3 ثوانٍ، وضوح الفكرة الواحدة، الحديث عن ألم العميل لا عن الخدمة، طبيعية اللهجة السعودية، وضوح الدعوة للفعل، خلوها من المبالغة والأرقام المختلقة والشهادات المزيفة، مناسبة نص الصوت للقراءة بصوت عالٍ.

ثم أعد كتابة كل جزء ضعيف ليصل إلى 9 من 10 على الأقل، مع الحفاظ على نفس الموضوع ونفس بنية JSON ونفس الحقول تماماً. لا تضف أسعاراً ولا مدد وصول ولا روابط.

المسودة:
${JSON.stringify(draft)}

أعد JSON فقط بنفس الحقول، مضافاً إليها:
 "score_before": رقم من 10 للمسودة الأصلية،
 "score": رقم من 10 بعد التحسين،
 "notes": "سطر واحد: ما الذي حسّنته"`;
}

const MOCK_DATA = {
  topic: "المكيف بعد صيف طويل",
  hooks: ["مكيفك يبرّد ونص؟", "صيف كامل.. ومكيفك ما انغسل؟", "فاتورتك ارتفعت والسبب مو الكهرباء"],
  reel: [
    { text: "مكيفك يبرّد ونص؟", say: "مكيفك صار يبرّد ونص؟ اسمعني دقيقة", icon: "ac", key: "ونص؟" },
    { text: "شغّال طول الصيف", say: "طول الصيف وهو شغّال ليل ونهار", icon: "thermo", key: "الصيف" },
    { text: "الفلتر مليان غبار", say: "والفلتر الحين غالباً مليان غبار ويخنق التبريد", icon: "fan", key: "غبار" },
    { text: "غسلة وحدة ترجّع برودته", say: "غسلة وحدة من فني متخصص ترجّع له برودته", icon: "check", key: "برودته" },
    { text: "اطلب فنيّك مجاناً من المنجز", say: "اطلب فني تكييف مجاناً من المنجز، الرابط في البايو", icon: "phone", key: "مجاناً" }
  ],
  snap: ["مكيفك يبرّد ونص؟", "الفلتر مليان غبار بعد الصيف", "اطلب فني تكييف مجاناً"],
  poll: "آخر غسيل لمكيفك؟ ◀ هذا العام / ما أذكر",
  facebook: "مكيفك يبرّد ونص؟\nبعد صيف المدينة الطويل، الفلتر غالباً مليان غبار.\nالفلتر المسدود يضعف التبريد ويتعب المكيف.\nغسلة وحدة ترجّع الكفاءة.\nمتى آخر مرة غسلت مكيفك؟",
  first_comment: "كم مكيف عندكم في البيت؟ 👇",
  tiktok_slides: ["مكيفك يبرّد ونص؟", "السبب غالباً الفلتر", "غسيل بعد الصيف يرجّع كفاءته", "اطلب فني تكييف من المنجز"],
  tiktok_caption: "غسيل المكيف بعد الصيف مو رفاهية ❄️\nمتى آخر غسلة لمكيفك؟",
  whatsapp: "❄️ المكيف ضعف بعد الصيف؟\nغسيل وصيانة من فنيي المنجز\nاطلب الحين 👇",
  haraj_title: "غسيل وصيانة مكيفات المدينة المنورة | المنجز",
  hashtags: ["#المدينة_المنورة", "#المنجز", "#تكييف", "#صيانة_مكيفات", "#صيانة_منزلية"]
};

function fix(o) {
  if (o && (!Array.isArray(o.reel) || o.reel.length < 3) && Array.isArray(o.tiktok_slides)) o.reel = o.tiktok_slides.map(t => ({ text: t, say: t }));
  if (o && Array.isArray(o.reel)) o.reel = o.reel.filter(s => s && s.text).map(s => ({ text: String(s.text), say: String(s.say || s.text), icon: String(s.icon || ""), key: String(s.key || "") }));
  return o;
}

function valid(o) {
  fix(o);
  return o && o.topic && o.facebook && Array.isArray(o.reel) && o.reel.length >= 3 && o.reel.every(s => s && s.text && s.say);
}

async function ask(prompt) {
  if (!KEY) { log("لا يوجد مفتاح Gemini"); return null; }
  for (const m of MODELS) {
    log("تجربة النموذج: " + m);
    const out = await callModel(m, prompt);
    if (out) { log("نجح: " + m); return out; }
  }
  return null;
}

async function generate(ctx) {
  if (process.env.MOCK) return Object.assign({ score_before: 7, score: 9, notes: "وضع تجريبي" }, MOCK_DATA);
  const draft = await ask(buildPrompt(ctx));
  if (!valid(draft)) return null;
  log("المسودة جاهزة — مراجعة المدير الإبداعي");
  await sleep(4000);
  const final = await ask(reviewPrompt(draft));
  if (valid(final)) { log("التقييم: " + final.score_before + " ← " + final.score); return final; }
  log("المراجعة فشلت — نعتمد المسودة");
  return draft;
}

const esc = s => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function block(title, icon, text) {
  return `<div class="card"><div class="ch"><span>${icon} ${title}</span><button onclick="cp(this)">نسخ</button></div><pre>${esc(text)}</pre></div>`;
}

const REVIEW_MSG = "السلام عليكم، شكراً لثقتك بالمنجز 🌿\nيهمنا رأيك في الفني والشغل: كيف كانت التجربة من 5؟\nولو تسمح لنا ننشر تقييمك (بدون اسمك ورقمك) نكون شاكرين.";

function render(c, ctx) {
  const nl = x => String(x || "").replace(/\\n/g, "\n");
  const tags = (c.hashtags || []).join(" ");
  const hooks = (c.hooks && c.hooks.length ? c.hooks : [c.topic]).map((h, i) => (i === 0 ? "⭐ " : (i + 1) + ". ") + h).join("\n");
  const reelScript = (c.reel || []).map((s, i) => "مشهد " + (i + 1) + "\n🖼️ " + s.text + "\n🎙️ " + s.say).join("\n\n");
  const snap = (c.snap || []).map((s, i) => "إطار " + (i + 1) + ": " + s).join("\n\n") + (c.poll ? "\n\n📊 تصويت: " + c.poll : "") + "\n\n🔗 " + SITE;
  const fb = nl(c.facebook) + "\n\n👇 اطلب فنيّك مجاناً:\n" + SITE + "\n\n" + tags;
  const tt = (c.tiktok_slides || []).map((s, i) => "شريحة " + (i + 1) + ": " + s).join("\n");
  const ttCap = nl(c.tiktok_caption) + "\nالرابط في البايو 🔗\n" + tags;
  const wa = nl(c.whatsapp) + "\n" + SITE;
  const slides = JSON.stringify((c.tiktok_slides || []).slice(0, 4)).replace(/</g, "\\u003c");
  const score = c.score ? `<div class="score">🎬 تقييم المدير الإبداعي: <b>${esc(c.score)}/10</b>${c.score_before ? " (المسودة " + esc(c.score_before) + ")" : ""}${c.notes ? "<br><small>" + esc(c.notes) + "</small>" : ""}</div>` : "";

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
.occ{background:var(--gold);color:#2a1c00;border-radius:10px;padding:8px 12px;margin-top:10px;font-size:13px;font-weight:700}
.score{background:rgba(0,0,0,.18);border-radius:10px;padding:8px 12px;margin-top:10px;font-size:13px}
h2{font-size:16px;margin:24px 0 0}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;margin-top:14px;overflow:hidden}
.ch{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#fafaf8;border-bottom:1px solid var(--line);font-weight:700;font-size:14.5px}
.ch button,.dl{border:0;background:var(--p);color:#fff;border-radius:9px;padding:7px 16px;font:inherit;font-size:13px;font-weight:700;text-decoration:none;display:inline-block;text-align:center}
.ch button.ok{background:#1c7a44}
pre{margin:0;padding:14px;white-space:pre-wrap;word-wrap:break-word;font-family:inherit;font-size:14.5px}
.tip{background:#fff8e6;border:1px solid #f0dfae;border-radius:12px;padding:12px 14px;margin-top:14px;font-size:13px}
.tip ol{margin:6px 0 0;padding-right:18px}
.sl{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:12px}
.sl img{width:100%;border-radius:10px;border:1px solid var(--line);display:block}
.sl .dl{margin-top:6px;width:100%}
.vid{padding:12px;text-align:center}.vid video{width:62%;max-width:300px;border-radius:12px;background:#000;display:block;margin:0 auto 10px}
.note{padding:0 12px 12px;font-size:12.5px;color:var(--mut)}
.plan{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;padding:12px 14px;font-size:13.5px}
.plan b{color:var(--pd)}
</style></head><body>
<header><div class="w" style="padding-bottom:0">
<h1>محتوى اليوم — المنجز</h1>
<div class="sub">${esc(ctx.iso)} · ${esc(ctx.hijriText)} · ${esc(ctx.type.name)}</div>
<div class="topic">${esc(c.topic)}</div>
<div class="meta">🛠️ ${esc(ctx.trade)} · 🎯 ${esc(ctx.type.audience)} · 🪝 ${esc(ctx.hook.n)}</div>
${ctx.occ ? '<div class="occ">🎉 ' + esc(ctx.occ) + "</div>" : ""}
${score}
</div></header>
<div class="w">
<h2>🎬 فيديو اليوم (ريلز بصوت سعودي)</h2>
<div class="card"><div class="vid">
<video src="${REEL_URL}?d=${esc(ctx.iso)}" controls playsinline preload="metadata"></video>
<a class="dl" href="${REEL_URL}">⬇️ تحميل الفيديو</a>
</div><div class="note">جاهز للنشر في تيك توك وسناب (سبوتلايت) وريلز إنستغرام وفيسبوك. لو لم يظهر، انتظر دقائق بعد التشغيل الصباحي ثم حدّث الصفحة.</div></div>

<h2>⏰ خطة نشر اليوم</h2>
<div class="card"><div class="plan">
<b>8–9 مساءً</b><span>الفيديو على تيك توك + سناب سبوتلايت (ذروة المشاهدة)</span>
<b>بعد العصر</b><span>منشور فيسبوك + الشرائح في الستوري مع التصويت</span>
<b>الصباح</b><span>حالة واتساب (يشوفها معارفك أول ما يصحون)</span>
<b>بعد النشر</b><span>ثبّت التعليق الأول، ورد على كل تعليق خلال ساعة</span>
</div></div>

<h2>🖼️ شرائح جاهزة للستوري والكاروسيل</h2>
<div class="card"><div class="sl" id="sl"></div><div class="note">اضغط «حفظ» أو اضغط مطولاً على الصورة لحفظها (مقاس 9:16).</div></div>

<h2>📝 النصوص</h2>
${block("الخطافات (اختر الأقوى)", "🪝", hooks)}
${block("سيناريو الفيديو (المشاهد والصوت)", "🎞️", reelScript)}
${block("تيك توك — التعليق", "✍️", ttCap)}
${block("ستوري سناب + تصويت", "👻", snap)}
${block("منشور فيسبوك", "📘", fb)}
${block("تعليق أول (ثبّته)", "💭", String(c.first_comment || ""))}
${block("تيك توك — نص الشرائح", "🎵", tt)}
${block("حالة واتساب", "💬", wa)}
${block("عنوان حراج (للتحديث)", "🏷️", String(c.haraj_title || ""))}

<h2>⭐ عجلة التقييمات (أقوى محتوى في خدمات المنازل)</h2>
${block("رسالة طلب تقييم — أرسلها للعميل بعد كل شغلة", "🤝", REVIEW_MSG)}
<div class="tip"><b>كيف تشتغل العجلة:</b><ol>
<li>بعد ما يخلص الفني، أرسل الرسالة للعميل خلال ساعتين (وقت رضاه في أعلى درجاته).</li>
<li>اطلب من الفني صورة «قبل» و«بعد» للشغل (بدون وجوه ولا أرقام).</li>
<li>انشر التقييم الحقيقي مع الصورتين — هذا يتفوق على أي إعلان.</li>
</ol></div>
<div class="tip"><b>القاعدة الذهبية:</b> الاستمرارية أهم من الكمال — المحتوى العضوي يبدأ يجيب طلبات عادة بعد 30 إلى 60 يوماً من النشر المنتظم.</div>
</div>
<script>
var SL=${slides};
function wrap(x,t,mw){var w=t.split(" "),l="",o=[];w.forEach(function(k){var tt=l?l+" "+k:k;if(x.measureText(tt).width>mw&&l){o.push(l);l=k}else l=tt});if(l)o.push(l);return o}
function draw(txt,i,logo){var c=document.createElement("canvas");c.width=1080;c.height=1920;var x=c.getContext("2d");
var g=x.createLinearGradient(0,0,1080,1920);g.addColorStop(0,"#167f79");g.addColorStop(.5,"#0e4c4a");g.addColorStop(1,"#08302e");x.fillStyle=g;x.fillRect(0,0,1080,1920);
x.fillStyle="rgba(255,255,255,.05)";x.beginPath();x.arc(950,260,380,0,7);x.fill();x.beginPath();x.arc(100,1750,300,0,7);x.fill();
x.direction="rtl";x.textAlign="center";
var last=i===SL.length-1,first=i===0,fs=first?116:last?104:96;x.font="800 "+fs+"px Tahoma,Arial,sans-serif";
var ls=wrap(x,txt,900),lh=fs*1.45,y=960-(ls.length*lh)/2+fs;
x.fillStyle=first?"#f3c566":"#ffffff";ls.forEach(function(s,k){x.fillText(s,540,y+k*lh)});
x.fillStyle="#c69541";x.fillRect(440,y+ls.length*lh,200,10);
if(last){x.fillStyle="#fff";x.font="700 54px Tahoma,Arial,sans-serif";x.fillText("الرابط في البايو 🔗  ·  مجاني",540,1500)}
x.font="700 46px Tahoma,Arial,sans-serif";x.fillStyle="rgba(255,255,255,.85)";x.fillText("المنجز · المدينة المنورة",540,1780);
x.font="600 40px Tahoma,Arial,sans-serif";x.fillText((i+1)+" / "+SL.length,540,150);
if(logo){try{x.drawImage(logo,490,1590,100,100)}catch(e){}}
return c}
function build(logo){var box=document.getElementById("sl");box.innerHTML="";SL.forEach(function(t,i){var u;try{u=draw(t,i,logo).toDataURL("image/png")}catch(e){u=draw(t,i,null).toDataURL("image/png")}
var d=document.createElement("div"),im=document.createElement("img");im.src=u;var a=document.createElement("a");a.className="dl";a.textContent="حفظ "+(i+1);a.href=u;a.download="munjiz-"+(i+1)+".png";d.appendChild(im);d.appendChild(a);box.appendChild(d)})}
build(null);
var lg=new Image();lg.onload=function(){build(lg)};lg.src="../logo.png";
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
  const doy = dayOfYear(p);
  const history = loadHistory();
  const ctx = {
    iso: p.iso,
    hijriText: h.text,
    type: TYPES[p.wd],
    trade: TRADES[doy % TRADES.length],
    season: seasonByMonth(p.m),
    hijriSeason: seasonByHijri(h.month),
    occ: occasion(p),
    framework: FRAMEWORKS[p.wd],
    hook: HOOKS[doy % HOOKS.length],
    history: history
  };
  log("اليوم: " + ctx.iso + " | " + ctx.type.name + " | " + ctx.trade + " | خطاف: " + ctx.hook.n);
  if (ctx.occ) log("مناسبة: " + ctx.occ);

  const c = await generate(ctx);
  if (!c) { log("فشل التوليد — يبقى محتوى الأمس، وسنحاول غداً"); return; }

  if (!fs.existsSync(ARCHIVE)) fs.mkdirSync(ARCHIVE, { recursive: true });
  const html = render(c, ctx);
  fs.writeFileSync(path.join(OUT, "today.html"), html, "utf8");
  fs.writeFileSync(path.join(ARCHIVE, ctx.iso + ".html"), html.replace(/\.\.\/logo\.png/g, "../../logo.png"), "utf8");
  fs.writeFileSync(path.join(OUT, "reel.json"), JSON.stringify({ date: ctx.iso, trade: ctx.trade, scenes: c.reel.slice(0, 6) }, null, 1), "utf8");
  const hist = history.filter(x => x.date !== ctx.iso);
  hist.push({ date: ctx.iso, topic: c.topic, hook: (c.hooks || [])[0] || "", trade: ctx.trade, type: ctx.type.name, score: c.score || null });
  fs.writeFileSync(HISTORY, JSON.stringify(hist.slice(-60), null, 1), "utf8");
  log("تم: social/today.html + reel.json + history.json");
})();
