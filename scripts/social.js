const fs = require("fs");
const path = require("path");

const SITE = "https://saeedoelusilve-collab.github.io/etqan-intake/home.html";
const ROOT = process.cwd();
const OUT = path.join(ROOT, "social");
const ARCHIVE = path.join(OUT, "archive");
const KEY = process.env.GEMINI_API_KEY || "";
const FALLBACK_MODELS = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-flash-lite-latest"];
let MODELS = null;
const MODEL_CACHE = path.join(process.cwd(), "social", "models.json");
function readModelCache() { try { return JSON.parse(fs.readFileSync(MODEL_CACHE, "utf8")); } catch (e) { return {}; } }
function writeModelCache(m) { try { const c = readModelCache(); if (c.last_ok !== m) { c.last_ok = m; c.date = new Date().toISOString().slice(0, 10); fs.mkdirSync(path.dirname(MODEL_CACHE), { recursive: true }); fs.writeFileSync(MODEL_CACHE, JSON.stringify(c)); } } catch (e) {} }

async function pickModels() {
  if (MODELS) return MODELS;
  let found = [];
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=" + KEY);
    const j = await r.json();
    found = (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes("generateContent")).map(m => m.name.replace("models/", ""))
      .filter(n => /^gemini-\d+(\.\d+)?-flash(-lite)?(-preview)?(-\d{2}-\d{4})?$/.test(n) && !/tts|image|audio|live|embed/.test(n));
  } catch (e) { log("تعذر جلب قائمة النماذج"); }
  const ver = n => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [0, 0])[1]);
  const score = n => ver(n) * 10 - (n.includes("lite") ? 5 : 0) - (n.includes("preview") ? 1 : 0);
  found.sort((a, b) => score(b) - score(a));
  MODELS = found.slice(0, 6).concat(FALLBACK_MODELS.filter(x => !found.includes(x)));
  const last = readModelCache().last_ok;
  if (last) { const rest = MODELS.filter(x => x !== last); MODELS = rest.slice(0, 1).concat([last], rest.slice(1)); }
  log("ترتيب النماذج: " + MODELS.join(" ، "));
  return MODELS;
}
const VERSIONS = ["v1beta", "v1"];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = m => console.log("[المحتوى] " + m);

const TRADES = ["سباكة", "كهرباء", "تكييف", "أجهزة كهربائية", "نجارة", "تبليط", "دهان", "جبس بورد", "سمنت بورد", "حدادة", "بناء ولياسة"];

const TYPES = {
  6: { name: "قصة فني ما جاء", audience: "أصحاب البيوت", brief: "قصة قصيرة عن عناء البحث عن فني (مواعيد لا تُحترم، أرقام كثيرة، سعر يتغير) في تخصص اليوم، تنتهي بأن طلباً واحداً عبر المنجز وفّر هذا العناء", story: true },
  0: { name: "علامات خطر", audience: "أصحاب البيوت", brief: "علامتان مبكرتان في البيت تبدوان بسيطتين لكنهما تنذران بخسارة أو خطر، تُرويان كموقف يعيشه المشاهد" },
  1: { name: "الفنادق والشقق المفروشة", audience: "ملاك الفنادق والشقق الفندقية والمفروشة ومكاتب العقار", brief: "قصة غرفة معطلة في موسم الزوار: نزيل ينتظر، تقييم سيئ، إيراد يضيع؛ والحل فني من شبكة المنجز في أي تخصص بطلب واحد", story: true },
  2: { name: "موقف طارئ", audience: "أصحاب البيوت", brief: "قصة عطل في أسوأ توقيت (حر الصيف، ضيوف، نهاية الأسبوع، الليل): ماذا تفعل في أول دقائق، ثم كيف تطلب الفني دون أن تضيع ساعات في الاتصالات", story: true },
  3: { name: "خرافة تكلّفك", audience: "أصحاب البيوت", brief: "اعتقاد شائع يبدو صحيحاً لكنه يكلّف صاحبه مالاً، يُروى كموقف حدث لشخص، ثم الحقيقة المفاجئة" },
  4: { name: "المقاولون والمشاريع", audience: "المقاولون وأصحاب مشاريع التشطيب", brief: "قصة مشروع تأخر لأن عامل تخصص واحد لم يحضر، فتوقفت كل المراحل؛ والحل عمالة تشطيب من شبكة المنجز بطلب واحد", story: true },
  5: { name: "إعلان المنجز", audience: "كل أصحاب البيوت في المدينة", brief: "إعلان علامة عاطفي: ثلاثة مواقف سريعة لثلاثة أشخاص مختلفين في ثلاثة تخصصات، كلهم عانوا من البحث عن فني، والحل واحد: طلب واحد من المنجز", multi: true, story: true }
};

const FACTS = {
  "سباكة": [
    "صنبور يقطر قطرة كل ثانية يهدر أكثر من 3000 غالون (نحو 11 ألف لتر) في السنة — وكالة حماية البيئة الأمريكية (EPA)",
    "سيفون (خزان مرحاض) يسرّب باستمرار قد يهدر 200 غالون (نحو 750 لتراً) أو أكثر يومياً — EPA",
    "رأس دش يقطر 10 قطرات في الدقيقة يهدر أكثر من 500 غالون (نحو 1900 لتر) سنوياً — EPA",
    "إصلاح التسربات المنزلية قد يخفض فاتورة الماء بأكثر من 10% — EPA"
  ],
  "تكييف": [
    "التكييف يستهلك نحو 70% من الطاقة في المنازل السعودية — البرنامج السعودي لكفاءة الطاقة (كفاءة)",
    "استبدال فلتر المكيف المتسخ بآخر نظيف قد يخفض استهلاك المكيف للطاقة من 5% إلى 15% — وزارة الطاقة الأمريكية",
    "يوصي البرنامج السعودي لكفاءة الطاقة بضبط المكيف على 24 درجة لتقليل الاستهلاك"
  ],
  "كهرباء": [
    "الحرائق المنزلية تشكل أكثر من 65% من حوادث الحريق في المملكة، والتماس الكهربائي في صدارة أسبابها — بحسب إحصاءات الدفاع المدني",
    "من أبرز أسباب التماس الكهربائي: التوصيلات المرتخية، وتحميل المقابس بأجهزة عالية الاستهلاك، وغياب القواطع الآلية المناسبة — الدفاع المدني"
  ],
  "أجهزة كهربائية": [
    "تحميل المقبس الواحد بعدة أجهزة عالية الاستهلاك من أبرز أسباب التماس الكهربائي — الدفاع المدني"
  ]
};
const HOTEL_FACTS = "المدينة المنورة فيها أكثر من 80 ألف غرفة فندقية مرخصة، ومعدل إشغال الضيافة 82% وهو الأعلى في المملكة، ومتوسط سعر الليلة نحو 453 ريالاً — وزارة السياحة 2026";

function factsFor(ctx) {
  const f = (FACTS[ctx.trade] || []).slice();
  if (/فنادق|مقاول/.test(ctx.type.name)) f.push(HOTEL_FACTS);
  return f;
}

const BEATS = {
  "قصة قصيرة": "1) موقف محدد بصيغة «أنت» (متى؟ أين؟ ماذا حدث؟) 2) التصعيد: ما الذي ساء بعدها 3) اللحظة الفارقة: المعلومة التي تقلب الموقف 4) الدعوة",
  "عدّ تنازلي": "1) «علامتان لو شفتهما...» وعد بقائمة قصيرة 2) العلامة الأولى ومعناها 3) العلامة الثانية ومعناها 4) الدعوة",
  "خطأ وصح": "1) الخطأ الذي يفعله أغلب الناس 2) ثمنه الحقيقي 3) الطريقة الصحيحة في جملة واحدة 4) الدعوة",
  "سؤال ومفاجأة": "1) سؤال يتحدى معلومة المشاهد 2) الإجابة المفاجئة 3) ماذا تفعل الآن 4) الدعوة",
  "سر الفني": "1) «لو سألت أي فني محترف...» 2) السر الذي لا يقوله الجميع 3) كيف تستفيد منه 4) الدعوة",
  "ثلاثة مواقف": "1) موقف من تخصص أول 2) موقف من تخصص ثانٍ 3) موقف من تخصص ثالث (كل مشهد موقف قصير بصيغة «أنت») 4) الدعوة"
};
const TYPE_BEAT = { 0: "عدّ تنازلي", 1: "قصة قصيرة", 2: "قصة قصيرة", 3: "خطأ وصح", 4: "قصة قصيرة", 5: "ثلاثة مواقف", 6: "قصة قصيرة" };

const ANGLES = [
  "الخسارة الخفية: مال يتسرب أو جهاز يتلف دون أن يشعر صاحب البيت",
  "أمان العائلة: خطر حقيقي (حريق، صعق، تسرب غاز، سقوط) يُعرض بهدوء دون تهويل",
  "كيف لا تُغش: ما يكشف الفني غير المحترف قبل أن تدفع",
  "سر المهنة: معلومة يعرفها الفنيون ولا يعرفها أغلب الناس",
  "الخطأ الشائع المكلف: شيء يفعله أغلب الناس ويدفعون ثمنه لاحقاً",
  "سيناريو طارئ: موقف يحدث فجأة وماذا تفعل في أول دقائق",
  "قرار كبير: قبل التشطيب أو التجديد أو شراء جهاز، ما الذي يجب أن تعرفه",
  "الرخيص الغالي: الحل الرخيص اليوم الذي يكلّف أضعافه غداً",
  "اختبار سريع: سؤال يتحدى معلومة المشاهد",
  "عناء البحث: الاتصال بعشرة فنيين وانتظار من لا يأتي، والحل بطلب واحد"
];


const VO = (process.env.VO_STYLE || "white").toLowerCase();
const LANG_SAY = VO === "fusha"
  ? "say بفصحى إعلانية سعودية معاصرة حيّة وبسيطة، كما يتكلم معلّق إعلانات سعودي، بلا أسلوب أدبي أو وعظي."
  : "say باللهجة السعودية البيضاء المهذبة كما يتكلم سعودي من المدينة مع صديقه أو جاره (مثل: الحين، وش، ليش، مو، لين، كذا، يعني، تراه، ما جاء)، طبيعية وصادقة، بلا مبالغة ولا كلمات سوقية، وبإملاء اللهجة المتعارف عليه. ممنوع الفصحى المتكلفة في say.";
const LANG_TEXT = "text على الشاشة بعربية بسيطة سليمة نحوياً وإملائياً (فصحى سهلة أو بيضاء مفهومة)، قصيرة جداً.";
const PAINS = [
  "الفني يقول «جايك بعد العصر» وما يجي، وتضيع يومك تنتظر",
  "تتصل بخمسة أرقام من حراج وجروبات الواتساب وكل واحد يحولك على ثاني",
  "السعر يتغير بعد ما يبدأ الشغل، أو يطلب مبلغ زيارة قبل ما يشوف المشكلة",
  "شغل مستعجل يرجع يخرب بعد أسبوع وتعيد الدفع مرتين",
  "العطل يجي في أسوأ وقت: حر الصيف، الضيوف جايين، نهاية الأسبوع، بالليل",
  "ما تعرف مين تثق فيه، وتخاف تدخل أي أحد بيتك"
];
const STORY = "صيغة القصة القصيرة الناجحة: شخصية (أنت أو شخص من المدينة باسم سعودي واضح أنه مثال) ← موقف محدد بالزمان والمكان ← تعقيد يزيد الضغط (من آلام الناس الحقيقية مع الفنيين) ← لحظة تحوّل: طلب واحد عبر المنجز ← نتيجة شعورية (راحة بال، وقت مع العائلة، بيت جاهز للضيوف). القصة تُقنع لأنها تشبه حياة المشاهد، لا لأنها تمدح الخدمة.";

const SERVICE_LIST = ["سباكة", "كهرباء", "تكييف", "أجهزة", "نجارة", "تبليط", "دهان", "جبس بورد", "سمنت بورد", "حدادة", "بناء"];

function servicesScene(ctx, doy) {
  const titles = ["كل ما يحتاجه بيتك", "فنيّ لكل شيء في بيتك", "بيتك كله في طلب واحد"];
  const SAYS = VO === "fusha"
    ? ["من أصغر عطل إلى تشطيب بيت كامل، كل ما يحتاجه بيتك بطلب واحد من المنجز.",
       "صيانة أو تشطيب أو بناء، المنجز يوصلك بالفني المناسب لكل شيء في بيتك.",
       "أياً كانت حاجة بيتك، تجد فنيّها في المنجز."]
    : ["من أصغر عطل لين تشطيب البيت كامل، كل اللي يحتاجه بيتك بطلب واحد من المنجز.",
       "صيانة، تشطيب، أو بناء، المنجز يوصلك بالفني المناسب لكل شي في بيتك.",
       "أي شي في بيتك يحتاج فني، تلقاه في المنجز."];
  return { kind: "services", text: titles[doy % titles.length], key: "", label: "", icon: "", broll: "", visual: "", say: SAYS[doy % SAYS.length] };
}

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

const DEAD = new Set();
const BUSY = new Set();

async function callModel(model, prompt) {
  if (DEAD.has(model)) return null;
  for (const ver of VERSIONS) {
    const url = "https://generativelanguage.googleapis.com/" + ver + "/models/" + model + ":generateContent?key=" + KEY;
    let gc = { temperature: 0.8, maxOutputTokens: 8192, responseMimeType: "application/json" };
    for (let attempt = 1; attempt <= 3; attempt++) {
      let res;
      try {
        res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(90000),
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: gc }) });
      } catch (e) { log(model + " شبكة/مهلة: " + e.message); DEAD.add(model); return null; }
      if (res.status === 429) {
        const msg = (await res.text()).replace(/\s+/g, " ").slice(0, 160);
        log(model + " ← 429 (الحصة المجانية غير متاحة أو انتهت) — ننتقل للنموذج التالي. " + msg);
        DEAD.add(model); return null;
      }
      if (res.status === 503) {
        if (MODELS && model === MODELS[0] && attempt < 3 && !BUSY.has(model)) { const w = 30000 * attempt; log(model + " مشغول (503) — النموذج الأقوى يستحق الانتظار، نعيد بعد " + (w / 1000) + " ث"); await sleep(w); continue; }
        log(model + " مشغول الآن (503) — ننتقل للتالي"); BUSY.add(model); return null;
      }
      if (res.status === 400 && gc.responseMimeType) { gc = { temperature: 0.8, maxOutputTokens: 8192 }; continue; }
      if (res.status === 404) break;
      if (!res.ok) { log(model + " " + ver + " ← " + res.status); DEAD.add(model); return null; }
      const j = await res.json();
      const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
      let t = parts.filter(x => x.text && !x.thought).map(x => x.text).join("");
      t = t.replace(/```json/g, "").replace(/```/g, "").trim();
      const i1 = t.indexOf("{"), i2 = t.lastIndexOf("}");
      try { return JSON.parse(i1 >= 0 ? t.slice(i1, i2 + 1) : t); } catch (e) { log(model + " رد غير صالح"); return null; }
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
- قالب السيناريو اليوم «${ctx.beat}»: ${BEATS[ctx.beat]}
${ctx.idea ? `
الفكرة المختارة (ابنِ كل المحتوى حولها بقوة):
- الفكرة: ${ctx.idea.idea}
- الزاوية: ${ctx.idea.angle || ""}
- الخطاف المقترح: ${ctx.idea.hook}
- ما يخسره المشاهد: ${ctx.idea.stakes || ""}
- الصيغة: ${ctx.idea.format || ""}
- الحقيقة الموثقة: ${ctx.idea.fact || "لا يوجد"}` : ""}

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
10) ${ctx.type.multi ? "اليوم إعلان علامة: المشاهد 1 و2 و3 ثلاثة مواقف من ثلاثة تخصصات مختلفة، والمشهد 4 الدعوة." : "الموضوع كله عن «تخصص اليوم» فقط، لا تنتقل لتخصص آخر."}
11) text في كل مشهد 6 كلمات كحد أقصى (المشهد الأول 5 كلمات)، و say 14 كلمة كحد أقصى. هذا شرط إلزامي.
12) label للمشاهد 2 و3 و4: كلمة أو كلمتان تصف دور المشهد حسب نوع المحتوى (مثل: الخرافة، الحقيقة، العلامة، الخطوة 1، النصيحة).
9) لكل مشهد اختر icon واحداً فقط من هذه القائمة: ac, drop, bolt, wrench, paint, tile, hammer, clock, alert, check, home, phone, plug, flame, thermo, fan, building, door, calendar, star. و key كلمة واحدة منسوخة حرفياً من text.
8) اللغة: ${LANG_SAY} ${LANG_TEXT} ممنوع الأسلوب الأدبي أو الوعظي أو الحِكَم والسجع. ممنوع التشكيل.
22) ${ctx.type.story ? STORY : "حتى المحتوى المعرفي يُروى كموقف يعيشه المشاهد، لا كمحاضرة."}
23) آلام حقيقية يعيشها الناس مع الفنيين (استخدمها كمادة للقصة، لا كإحصاءات): ${PAINS.join("؛ ")}.
24) الإقناع يأتي من الصدق والتفاصيل الصغيرة المألوفة (صوت المكيف وهو يطفي، رسالة «جايك بعد العصر»، الضيوف على الباب)، لا من المديح.
20) المشهد الأول يرسم موقفاً محدداً يراه المشاهد في رأسه (من؟ أين؟ متى؟) مثل: «الساعة عشرة بالليل، والضيوف بعد ساعة، والمكيف وقف». المخاطبة بصيغة «أنت» مباشرة.
21) ممنوع الوعود والادعاءات: «نضمن»، «ضمان»، «فوراً»، «خلال ساعة»، «معتمد»، «الأفضل»، «الأرخص»، «بلا غرامات»، «تطبيق». المنجز يوصلك بفنيين من شبكته، والطلب مجاني عبر الرابط في البايو، والفني يتواصل معك مباشرة — هذه فقط الوعود المسموحة.
13) say نص يُقرأ بصوت معلّق إعلانات: جملة أو جملتان قصيرتان لكل مشهد (نَفَس واحد، 14 كلمة كحد أقصى)، تنتهي بنقطة أو علامة استفهام، وكل مشهد يبدأ بكلمة ربط تكمل ما قبله (لكن، والمشكلة، والحل، لذلك) لتصبح القصة متصلة. اكتب الأرقام بالكلمات.
16) visual لكل مشهد عدا الأخير: جملة إنجليزية قصيرة تصف اللقطة المثالية بدقة (مثل: close-up of hands fixing a dripping faucet). يُفضّل لقطات الأيدي والأدوات والأشياء، لا وجوه الأشخاص.
14) broll لكل مشهد عدا الأخير: كلمة أو كلمتان إنجليزيتان فقط، اسم شيء ملموس يظهر في لقطة فيديو مخزون (مثل: plumber, faucet, electrical panel, air conditioner, paint roller, carpenter)، بلا أفعال ولا أوصاف.
15) الإيقاع (4 مشاهد): الأول صدمة أو سؤال، والثاني يعمّق العاقبة أو يكشف السر، والثالث الحل العملي، والرابع الدعوة.
17) سيُضاف تلقائياً قبل مشهد الدعوة مشهد يعرض كل خدمات المنجز (سباكة، كهرباء، تكييف، أجهزة، نجارة، تبليط، دهان، جبس بورد، سمنت بورد، حدادة، بناء)، فلا تعدّد الخدمات بنفسك، واجعل الدعوة تكمله طبيعياً (مثل: «أياً كان ما يحتاجه بيتك، اطلب فنيّك مجاناً من المنجز. الرابط في البايو.»).
18) اذكر اسم «المنجز» بالصوت مرة واحدة بشكل طبيعي في المشهد الثاني أو الثالث (ظهور العلامة مبكراً يرفع تذكّرها)، إضافة إلى مشهد الدعوة.
19) في facebook وwhatsapp أضف سطراً قصيراً يذكر أن المنجز يغطي كل خدمات البيت، لا تخصص اليوم فقط.

حقائق موثقة يمكنك استخدامها (انقل الرقم كما هو واذكر الجهة باختصار إن استخدمته، ولا تستخدم أي رقم غيرها):
${factsFor(ctx).map(f => "- " + f).join("\n") || "- لا توجد أرقام موثقة لهذا التخصص؛ لا تستخدم أي أرقام."}

قواعد صارمة:
- بلا مبالغة ولا تهويل ولا وعود غير مضمونة.
- لا أسعار بالريال، ولا مدة وصول محددة، ولا أي رقم أو إحصائية خارج الحقائق الموثقة أعلاه.
- كن محدداً وملموساً: اذكر الشيء بعينه (المقبس، الخلاط، فلتر المكيف، مفصلة الباب)، والنتيجة بعينها، والفعل بعينه. ممنوع العبارات العامة المبهمة مثل «تقلبات الجو تضعف الجدران».
- ممنوع اختلاق تقييمات أو شهادات عملاء أو قصص على أنها حقيقية.
- المنجز ليس له تطبيق جوال: الطلب يتم عبر الرابط في البايو فقط. لا تذكر «تطبيق» ولا «رسوم» ولا «زيارة مجانية» ولا أي وعد لم يُذكر هنا.
- لا روابط. لا تقلّد إعلاناً أو شعاراً أو شخصية مشهورة.

أعد JSON فقط بلا أي نص آخر وبلا علامات كود:
{
 "topic": "موضوع اليوم في سطر",
 "hooks": ["الخطاف الرئيسي", "بديل 1", "بديل 2"],
 "reel": [
  {"text": "نص الشاشة للمشهد 1 = الخطاف (6 كلمات أو أقل)", "say": "ما يُقال بالصوت (12 كلمة أو أقل)", "icon": "رمز من القائمة", "key": "كلمة واحدة من text تُبرز بالذهبي", "broll": "english stock video query", "visual": "english shot description"},
  {"text": "مشهد 2", "say": "...", "icon": "...", "key": "...", "label": "...", "broll": "...", "visual": "..."},
  {"text": "مشهد 3", "say": "...", "icon": "...", "key": "...", "label": "...", "broll": "...", "visual": "..."},
  {"text": "اطلب فنيّك مجاناً من المنجز", "say": "دعوة صوتية واضحة تنتهي بعبارة: الرابط في البايو.", "icon": "phone", "key": "مجاناً"}
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

قيّم المسودة من 10 بهذه المعايير: هل الفكرة قوية تستحق المشاهدة أم باهتة (إن كانت باهتة فاجعل زاويتها أقوى بربطها بخسارة أو خطر أو سر)، قوة الخطاف في أول 3 ثوانٍ، وضوح الفكرة الواحدة، الحديث عن ألم العميل لا عن الخدمة، سلامة اللغة العربية وجمالها، وضوح الدعوة للفعل، خلوها من المبالغة والأرقام المختلقة والشهادات المزيفة، مناسبة نص الصوت للقراءة بصوت عالٍ.

ثم أعد كتابة كل جزء ضعيف ليصل إلى 9 من 10 على الأقل، مع الحفاظ على نفس الموضوع ونفس بنية JSON ونفس الحقول تماماً. لا تضف أسعاراً ولا مدد وصول ولا روابط.

المسودة:
${JSON.stringify(draft)}

أعد JSON فقط بنفس الحقول، مضافاً إليها:
 "score_before": رقم من 10 للمسودة الأصلية،
 "score": رقم من 10 بعد التحسين،
 "notes": "سطر واحد: ما الذي حسّنته"`;
}

const MOCK_DATA = {
  topic: "مكيّفك بعد صيف طويل",
  hooks: ["مكيّفك لم يعد يبرّد كما كان؟", "صيفٌ كامل ومكيّفك لم يُغسل؟", "التبريد ضعيف والسبب أبسط مما تظن"],
  reel: [
    { text: "مكيّفك لم يعد يبرّد؟", say: "هل لاحظت أن مكيّفك لم يعد يبرّد كما كان؟", icon: "ac", key: "يبرّد؟", broll: "air conditioner indoor unit" },
    { text: "صيفٌ كامل من التشغيل", say: "صيفٌ كامل من التشغيل المتواصل، ليلاً ونهاراً.", icon: "thermo", key: "صيفٌ", label: "المشكلة", broll: "hot summer city sun" },
    { text: "الغبار يخنق الفلتر", say: "والغبار المتراكم في الفلتر يخنق التبريد ويُتعب الجهاز.", icon: "fan", key: "الغبار", label: "السبب", broll: "dusty air filter" },
    { text: "غسلة واحدة تعيد برودته", say: "غسلةٌ واحدة على يد فنّي متخصص تعيد إليه برودته.", icon: "check", key: "برودته", label: "الحل", broll: "technician cleaning air conditioner" },
    { text: "اطلب فنّيك مجاناً من المنجز", say: "اطلب فنّي التكييف الآن مجاناً من المنجز. الرابط في البايو.", icon: "phone", key: "مجاناً" }
  ],
  snap: ["مكيّفك لم يعد يبرّد؟", "الغبار يخنق الفلتر بعد الصيف", "اطلب فنّي تكييف مجاناً"],
  poll: "متى غسلت مكيّفك آخر مرة؟ ◀ هذا العام / لا أذكر",
  facebook: "مكيّفك لم يعد يبرّد كما كان؟\nبعد صيف المدينة الطويل، يمتلئ الفلتر غالباً بالغبار.\nالفلتر المسدود يُضعف التبريد ويُتعب الجهاز.\nغسلة واحدة تعيد إليه كفاءته.\nمتى غسلت مكيّفك آخر مرة؟",
  first_comment: "كم مكيّفاً في بيتكم؟ 👇",
  tiktok_slides: ["مكيّفك لم يعد يبرّد؟", "السبب غالباً الفلتر", "غسلة بعد الصيف تعيد كفاءته", "اطلب فنّي تكييف من المنجز"],
  tiktok_caption: "غسيل المكيّف بعد الصيف ليس رفاهية ❄️\nمتى غسلت مكيّفك آخر مرة؟",
  whatsapp: "❄️ هل ضعف تبريد مكيّفك بعد الصيف؟\nغسيل وصيانة على يد فنّيي المنجز\nاطلب الآن 👇",
  haraj_title: "غسيل وصيانة مكيفات المدينة المنورة | المنجز",
  hashtags: ["#المدينة_المنورة", "#المنجز", "#تكييف", "#صيانة_مكيفات", "#صيانة_منزلية"]
};

function tighten(t) {
  const w = String(t).trim().split(/\s+/);
  if (w.length <= 8) return t;
  const parts = String(t).split(/[،,.!؟?—]+/).map(x => x.trim()).filter(x => x && x.split(/\s+/).length >= 2 && x.split(/\s+/).length <= 8);
  return parts.length ? parts[0] + (/[؟?]$/.test(t) ? "؟" : "") : t;
}

function splitLabel(s) {
  const m = String(s.text).match(/^\s*([^:]{2,18}):\s*(.+)$/);
  if (m && m[1].trim().split(/\s+/).length <= 2 && m[2].trim().split(/\s+/).length >= 2) {
    if (!s.label) s.label = m[1].trim();
    s.text = m[2].trim();
  }
  return s;
}

const BANNED = [[/أمهر |أفضل |أقوى /g, ""], [/الأمهر|الأفضل|الأقوى|الأرخص/g, "المناسب"], [/نضمن لك/g, "نساعدك على"], [/نضمن/g, "نساعد على"], [/بضمان\s*\S*/g, ""], [/\s*فوراً|\s*فورا/g, ""], [/خلال ساعة/g, ""], [/معتمدين|معتمد/g, "من شبكتنا"], [/تطبيق المنجز/g, "المنجز"], [/عبر التطبيق|من التطبيق/g, "عبر الرابط في البايو"], [/بلا غرامات|دون غرامات/g, ""]];

function sanitize(t) {
  let x = String(t || "");
  BANNED.forEach(([re, rep]) => { x = x.replace(re, rep); });
  return x.replace(/[\u064C-\u0650\u0652]/g, "").replace(/\s+([،.؟!])/g, "$1").replace(/\s{2,}/g, " ").trim();
}

function fix(o) {
  if (o) ["facebook", "whatsapp", "tiktok_caption", "first_comment", "haraj_title"].forEach(k => { if (typeof o[k] === "string") o[k] = o[k].split(/\n|\\n/).map(sanitize).join("\n"); });
  if (o && (!Array.isArray(o.reel) || o.reel.length < 3) && Array.isArray(o.tiktok_slides)) o.reel = o.tiktok_slides.map(t => ({ text: t, say: t }));
  if (o && Array.isArray(o.reel)) o.reel = o.reel.filter(s => s && s.text).map(splitLabel).map(s => ({ text: tighten(sanitize(s.text)), say: sanitize(s.say || s.text), icon: String(s.icon || ""), key: String(s.key || ""), label: String(s.label || ""), broll: Array.isArray(s.broll) ? s.broll.join(" ") : String(s.broll || ""), visual: String(s.visual || "") }));
  return o;
}

function valid(o) {
  fix(o);
  return o && o.topic && o.facebook && Array.isArray(o.reel) && o.reel.length >= 3 && o.reel.every(s => s && s.text && s.say);
}

async function ask(prompt) {
  if (!KEY) { log("لا يوجد مفتاح Gemini"); return null; }
  for (const m of await pickModels()) {
    if (!DEAD.has(m)) log("تجربة النموذج: " + m);
    const out = await callModel(m, prompt);
    if (out) { log("نجح: " + m); writeModelCache(m); return out; }
  }
  return null;
}

function ideasPrompt(ctx) {
  const recent = ctx.history.slice(-21).map(h => "- " + h.topic).join("\n");
  const facts = factsFor(ctx);
  return `أنت رئيس قسم الإبداع في وكالة إعلانات سعودية كبرى. عميلك "المنجز": شبكة فنّيين في المدينة المنورة، الطلب مجاني والفني يتواصل مع العميل.

اقترح 6 أفكار مختلفة تماماً لفيديو ريلز قصير (30–40 ثانية) اليوم:
- التخصص: ${ctx.trade} (كل الأفكار عنه فقط)
- نوع المحتوى: ${ctx.type.name} — ${ctx.type.brief}
- الجمهور: ${ctx.type.audience}
- الموسم: ${ctx.season}${ctx.hijriSeason ? " | " + ctx.hijriSeason : ""}${ctx.occ ? " | " + ctx.occ : ""}

المشاهد المستهدف: صاحب بيت في المدينة المنورة، عنده عائلة، صيفه فوق 45 درجة، يستقبل ضيوفاً وزواراً، تعب من فنيين لا يلتزمون أو يرفعون السعر، ويتصفح تيك توك وسناب بسرعة.

${facts.length ? "حقائق موثقة قوية (فكرة واحدة على الأقل يجب أن تُبنى على إحداها):\n" + facts.map(f => "- " + f).join("\n") : "لا توجد أرقام موثقة لهذا التخصص: لا تستخدم أي أرقام."}

صيغ أثبتت نجاحها في محتوى خدمات المنازل (نوّع بينها):
- الرقم الصادم من حقيقة موثقة («قطرة واحدة كل ثانية = 11 ألف لتر في السنة»)
- العلامة ومعناها («لو شفت هذا في المقبس، افصل الكهرباء فوراً»)
- سؤال يكشف الفني غير المحترف قبل أن تدفع
- الطوارئ: ماذا تفعل في أول دقيقتين
- الخطأ الذي يفعله أغلب الناس ويدفعون ثمنه
- مشهد يومي يعرفه الجميع بلمسة طرافة خفيفة («لما تقرر تصلحها بنفسك...»)
- كم يكلفك التأجيل

آلام الناس الحقيقية مع الفنيين (من استطلاعات أصحاب البيوت: ضعف التواصل والمواعيد، عدم الحضور، تغيّر السعر أثناء العمل، شغل مستعجل يرجع يخرب) — أقوى الأفكار تحوّل أحد هذه الآلام إلى قصة قصيرة:
${PAINS.map(p => "- " + p).join("\n")}
${ctx.type.story ? "اليوم يوم قصة: كل الأفكار الست يجب أن تكون قصصاً قصيرة. " + STORY : ""}

زوايا إضافية:
${ANGLES.map(a => "- " + a).join("\n")}

شروط الفكرة القوية: محددة (شيء بعينه في البيت)، فيها عاقبة واضحة (مال، أمان، راحة العائلة، إحراج أمام الضيوف)، وفيها معلومة جديدة أو مفاجئة، وتنتهي بحاجة طبيعية لطلب فني.
ممنوع: الأفكار الباهتة أو العامة (صوت بسيط، تزييت، تنظيف عادي، «تقلبات الجو»)، وتكرار هذه المواضيع الأخيرة:
${recent || "- لا يوجد"}
ممنوع اختلاق أرقام أو إحصاءات أو شهادات عملاء.

قيّم كل فكرة بصرامة من 10: stop (إيقاف التمرير في أول ثانيتين)، stakes (حجم العاقبة)، curiosity، relevance (قربها من حياة صاحب بيت في المدينة)، share (احتمال أن يرسلها لأحد).

أعد JSON فقط:
{"ideas":[{"angle":"...","format":"الصيغة","idea":"الفكرة في سطر","hook":"خطاف 7 كلمات أو أقل","stakes":"العاقبة المحددة","fact":"الحقيقة الموثقة المستخدمة أو فارغ","scores":{"stop":0,"stakes":0,"curiosity":0,"relevance":0,"share":0}}]}`;
}

function judgePrompt(ideas) {
  return `أنت صاحب بيت سعودي في المدينة المنورة تتصفح تيك توك بسرعة، ومللت من الإعلانات المكررة. أمامك ${ideas.length} أفكار لفيديوهات قصيرة.
رتّبها من الأقوى إلى الأضعف حسب سؤال واحد: أيها سيجعلك تتوقف وتشاهد حتى النهاية وتفكر في طلب فني؟ كن قاسياً مع الأفكار العامة أو المكررة.

${ideas.map((x, i) => i + ") " + x.hook + " — " + x.idea).join("\n")}

أعد JSON فقط: {"order":[أرقام الأفكار مرتبة], "why":"سطر واحد عن سبب اختيار الأولى"}`;
}

async function pickIdea(ctx) {
  const r = await ask(ideasPrompt(ctx));
  const list = (r && Array.isArray(r.ideas) ? r.ideas : []).filter(x => x && x.idea && x.hook);
  if (!list.length) { log("مرحلة الأفكار فشلت — نكمل بدونها"); return null; }
  const sum = x => { const s = x.scores || {}; return (+s.stop || 0) * 1.5 + (+s.stakes || 0) * 1.3 + (+s.curiosity || 0) + (+s.relevance || 0) + (+s.share || 0) * 0.7; };
  const pts = list.map((x, i) => ({ x, i, p: sum(x) }));
  await sleep(2000);
  const j = await ask(judgePrompt(list));
  if (j && Array.isArray(j.order)) {
    j.order.map(Number).filter(n => n >= 0 && n < list.length).forEach((n, rank) => { pts[n].p += (list.length - rank) * 6; });
    if (j.why) log("حكم المشاهد: " + j.why);
  }
  pts.sort((a, b) => b.p - a.p);
  log("الفكرة الفائزة من " + list.length + ": " + pts[0].x.idea);
  return pts[0].x;
}

async function generate(ctx) {
  if (process.env.MOCK) return Object.assign({ score_before: 7, score: 9, notes: "وضع تجريبي" }, MOCK_DATA);
  ctx.idea = await pickIdea(ctx);
  await sleep(3000);
  const draft = await ask(buildPrompt(ctx));
  if (!valid(draft)) return null;
  log("المسودة جاهزة — مراجعة المدير الإبداعي");
  await sleep(4000);
  const final = await ask(reviewPrompt(draft));
  if (valid(final)) { log("التقييم: " + final.score_before + " ← " + final.score); return await polish(await doctor(final, ctx)); }
  log("المراجعة فشلت — نعتمد المسودة");
  return await polish(await doctor(draft, ctx));
}

function proofPrompt(c) {
  return `أنت مدقق لغوي عربي محترف ومحرر إعلانات. راجع النصوص العربية في هذا JSON لمحتوى "المنجز" وصحّح كل خطأ نحوي أو إملائي أو صرفي أو أسلوبي:
- التذكير والتأنيث والمطابقة (مثال خطأ: «غسيلة بسيط» ← «غسلة بسيطة»).
- الهمزات، والتاء المربوطة والهاء، والألف المقصورة والياء، والتنوين.
- ${VO === "fusha" ? "حوّل أي كلمة عامية مكتوبة إلى فصحى معاصرة سهلة" : "نص say باللهجة السعودية البيضاء عمداً: لا تحوّله إلى فصحى، بل صحّح إملاء اللهجة المتعارف عليه واجعله يُسمع كسعودي حقيقي يتكلم بطبيعية؛ أما text وبقية المنشورات فبعربية بسيطة سليمة"}، وأزل الركاكة والتكرار.
- اقرأ say في ذهنك بصوت معلّق إعلانات سعودي: إن بدت جملة متكلفة أو أدبية أو وعظية أو طويلة، أعد صياغتها ببساطة وحيوية. لا تضع أي تشكيل. اكتب الأرقام بالكلمات.
- احذف أي وعد أو ادعاء ممنوع: نضمن، ضمان، فوراً، خلال ساعة، معتمد، الأفضل، الأرخص، بلا غرامات، تطبيق.
- text في مشاهد reel لا يتجاوز 6 كلمات أبداً (اختصره دون أن يفقد معناه)، و say لا يتجاوز 18 كلمة.
- يجب أن تبقى key كلمة منسوخة حرفياً من text بعد التصحيح.
- احذف أي ذكر لـ«تطبيق المنجز» أو «رسوم» واستبدله بـ«الرابط في البايو».
- لا تغيّر المعنى ولا الموضوع ولا الحقول ولا القيم الإنجليزية (icon, broll, visual)، ولا الأرقام score.
أعد JSON نفسه كاملاً مصححاً فقط، مضافاً إليه "fixes": عدد التصحيحات.

${JSON.stringify(c)}`;
}

function doctorPrompt(c, ctx) {
  const lines = c.reel.map((x, i) => ({ i: i, text: x.text, say: x.say }));
  return `أنت أفضل كاتب سيناريو إعلانات قصيرة في السعودية (مستوى جوائز كان ليونز). أمامك سيناريو ريلز لـ"المنجز" (شبكة فنيين في المدينة المنورة، الطلب مجاني عبر الرابط في البايو). القالب: «${ctx.beat}» — ${BEATS[ctx.beat]}.

أعد كتابة text و say لكل مشهد ليصبح السيناريو أقوى وأكثر طبيعية عند سماعه:
- say في المشهد الأول 10 كلمات كحد أقصى، وبقية المشاهد 14 كلمة كحد أقصى، جملة أو جملتان بنَفَس واحد.
- إيقاع منطوق: كلمات بسيطة يقولها الناس فعلاً، صورة واحدة في كل جملة، ولا جمل اعتراضية.
- اربط المشاهد بكلمات انتقال (لكن، والمشكلة، والحل، لذلك) حتى تُسمع كقصة واحدة لها تصاعد ثم لحظة تحوّل.
- اختم المشهد قبل الأخير بجملة قوية تُحفظ.
- اذكر «المنجز» مرة في المشهد الثاني أو الثالث، ومرة في الدعوة.
- text على الشاشة 6 كلمات كحد أقصى، ويلخّص say ولا يكرره حرفياً.
- ${LANG_SAY} ${LANG_TEXT} لا تشكيل إلا تنوين الفتح في الأحوال (مجاناً، دائماً).
- ${STORY}
- لا وعود: نضمن، فوراً، خلال ساعة، معتمد، الأفضل، تطبيق. لا أرقام إلا الموجودة أصلاً.
- لا تغيّر الفكرة ولا ترتيب المشاهد ولا عددها.

السيناريو:
${JSON.stringify(lines)}

أعد JSON فقط: {"reel":[{"i":0,"text":"...","say":"..."}],"note":"سطر: ما الذي حسّنته"}`;
}

async function doctor(c, ctx) {
  await sleep(2500);
  const r = await ask(doctorPrompt(c, ctx));
  if (!r || !Array.isArray(r.reel)) { log("طبيب السيناريو لم يرد — نكمل"); return c; }
  let n = 0;
  r.reel.forEach((x, idx) => {
    const i = x.i != null && !isNaN(+x.i) ? +x.i : idx;
    if (c.reel[i] && x.text && x.say) { c.reel[i].text = x.text; c.reel[i].say = x.say; n++; }
  });
  log("طبيب السيناريو أعاد كتابة " + n + " مشاهد" + (r.note ? ": " + r.note : ""));
  return c;
}

async function polish(c) {
  await sleep(3000);
  const p = await ask(proofPrompt(c));
  if (valid(p)) { log("التدقيق اللغوي: " + (p.fixes || 0) + " تصحيح"); ["score", "score_before", "notes"].forEach(k => { if (p[k] == null) p[k] = c[k]; }); return p; }
  log("التدقيق فشل — نعتمد النص كما هو");
  return c;
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
  const svc = "🛠️ المنجز لكل بيتك: " + SERVICE_LIST.join(" • ");
  const fb = nl(c.facebook) + "\n\n" + svc + "\n\n👇 اطلب فنيّك مجاناً:\n" + SITE + "\n\n" + tags;
  const tt = (c.tiktok_slides || []).map((s, i) => "شريحة " + (i + 1) + ": " + s).join("\n");
  const ttCap = nl(c.tiktok_caption) + "\nالرابط في البايو 🔗\n" + tags;
  const wa = nl(c.whatsapp) + "\n" + svc + "\n" + SITE;
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
</div><div class="note">جاهز للنشر في تيك توك وسناب (سبوتلايت) وريلز إنستغرام وفيسبوك. لو لم يظهر، انتظر دقائق بعد التشغيل الصباحي ثم حدّث الصفحة. اللقطات المصوّرة من Pexels وPixabay (مجانية للاستخدام التجاري).</div></div>

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
    trade: TYPES[p.wd].multi ? "كل الخدمات" : TRADES[doy % TRADES.length],
    season: seasonByMonth(p.m),
    hijriSeason: seasonByHijri(h.month),
    occ: occasion(p),
    framework: FRAMEWORKS[p.wd],
    hook: HOOKS[doy % HOOKS.length],
    beat: TYPE_BEAT[p.wd] || "قصة قصيرة",
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
  const story = c.reel.slice(0, 5);
  if (story.length > 3) story.pop();
  const CTAS = VO === "fusha" ? [
    { text: "اطلب فنيّك مجاناً من المنجز", say: "أياً كان ما يحتاجه بيتك، اطلب فنيّك مجاناً من المنجز. الرابط في البايو." },
    { text: "طلب واحد.. والفني يتواصل معك", say: "اكتب طلبك مرة واحدة، وفني المنجز يتواصل معك مباشرة. الرابط في البايو." },
    { text: "لا تضيع وقتك بالبحث", say: "لا تضيع وقتك بالبحث. اطلب فنيّك مجاناً من المنجز، الرابط في البايو." }
  ] : [
    { text: "طلب واحد.. والفني يتواصل معك", say: "اكتب طلبك مرة وحدة، والفني يتواصل معك مباشرة. الرابط في البايو." },
    { text: "لا تتعب نفسك بالدوّارة", say: "لا تتعب نفسك بالدوّارة. اطلب فنيّك مجاناً من المنجز، والرابط في البايو." },
    { text: "بيتك يستاهل راحة بالك", say: "بيتك يستاهل راحة بالك. اطلب فنيّك مجاناً من المنجز، الرابط في البايو." }
  ];
  const cta = Object.assign({ icon: "phone", key: "مجاناً", label: "" }, CTAS[doy % CTAS.length]);
  const scenes = story.slice(0, 4).concat([servicesScene(ctx, doy)], [cta]);
  fs.writeFileSync(path.join(OUT, "reel.json"), JSON.stringify({ date: ctx.iso, trade: ctx.trade, scenes: scenes }, null, 1), "utf8");
  const hist = history.filter(x => x.date !== ctx.iso);
  hist.push({ date: ctx.iso, topic: c.topic, hook: (c.hooks || [])[0] || "", trade: ctx.trade, type: ctx.type.name, angle: (ctx.idea && ctx.idea.angle) || "", score: c.score || null });
  fs.writeFileSync(HISTORY, JSON.stringify(hist.slice(-60), null, 1), "utf8");
  log("تم: social/today.html + reel.json + history.json");
})();
