import asyncio, base64, glob, json, os, re, shutil, subprocess, sys, urllib.request, urllib.error, time

ROOT = os.getcwd()
SRC = os.path.join(ROOT, "social", "reel.json")
OUT = os.environ.get("REEL_OUT", os.path.join(ROOT, "reel_out"))
KEY = os.environ.get("GEMINI_API_KEY", "")
VOICE = os.environ.get("TTS_VOICE", "Puck")
VO_STYLE = os.environ.get("VO_STYLE", "white").lower()
STYLE = os.environ.get("TTS_STYLE") or ("warm, confident commercial voice-over, conversational and natural, medium-fast pace, slight smile" if VO_STYLE == "fusha"
         else "natural and conversational, like a real person telling a friend a short story; warm, sincere, relaxed pace, not an announcer")
VOICES_FILE = os.path.join(ROOT, "social", "voices.json")
PERSONAS = [
    ("munjiz-saudi-warm", "A warm, friendly Saudi man in his early thirties from Medina with a natural Hijazi Saudi accent, speaking like a real person telling a friend a story, relaxed and sincere."),
    ("munjiz-saudi-lively", "An upbeat, natural Saudi man in his late twenties speaking white Saudi dialect with a smiling voice, like a popular Saudi creator talking to his followers.")
]
VOICE_LOG = os.path.join(ROOT, "social", "voice_log_v2.json")
BRAND_SAY = os.environ.get("BRAND_SAY", "").strip()
QA_MODELS = ["gemini-3.5-flash", "gemini-flash-latest", "gemini-3.5-flash-lite", "gemini-flash-lite-latest"]
HARAKAT = re.compile(r"[\u064C-\u0650\u0652\u0670]")
EDGE_VOICES = ["ar-SA-HamedNeural", "ar-SA-ZariyahNeural"]
SR = 44100
OUTRO = 2.2
LEAD = 0.05
GAP = 0.3
API = "https://generativelanguage.googleapis.com/v1beta"


def log(m):
    print("[الصوت] " + m, flush=True)


def ff(args):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error"] + args, check=True)


def probe(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path],
                       capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except Exception:
        return 0.0


def http(url, body=None, headers=None, timeout=180):
    h = {"Content-Type": "application/json"}
    h.update(headers or {})
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, headers=h,
                                 method="POST" if body is not None else "GET")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def tts_models():
    names = []
    try:
        j = http(API + "/models?pageSize=200&key=" + KEY, timeout=30)
        names = [m["name"].replace("models/", "") for m in j.get("models", []) if "tts" in m["name"]]
    except Exception as e:
        log("قائمة النماذج: %s" % str(e)[:80])
    ver = lambda n: float((re.search(r"gemini-(\d+(?:\.\d+)?)", n) or [0, "0"])[1])
    names.sort(key=lambda n: ver(n) * 10 - (5 if "lite" in n else 0) - (1 if "preview" in n else 0), reverse=True)
    for f in ["gemini-3.8-flash-tts", "gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"]:
        if f not in names:
            names.append(f)
    return names[:5]


def save_audio(raw, path, mime=""):
    tmp = path + ".raw"
    open(tmp, "wb").write(raw)
    if raw[:4] == b"RIFF" or "wav" in mime:
        ff(["-i", tmp, "-ar", str(SR), "-ac", "1", path])
    else:
        rate = re.search(r"rate=(\d+)", mime)
        ff(["-f", "s16le", "-ar", rate.group(1) if rate else "24000", "-ac", "1", "-i", tmp, "-ar", str(SR), "-ac", "1", path])
    os.remove(tmp)
    return probe(path) > 1.0


def clean_tts(t):
    t = HARAKAT.sub("", str(t))
    t = t.replace("ـ", "")
    return re.sub(r"\s+", " ", t).strip()


def discover_voices():
    found = []
    for q in ["?language_code=ar-SA&region_code=SA", "?language_code=ar", "?languageCode=ar", "?pageSize=300"]:
        try:
            j = http(API + "/voices" + q, None, {"x-goog-api-key": KEY}, timeout=30)
        except Exception:
            continue
        for v in j.get("voices", []) or []:
            blob = json.dumps(v, ensure_ascii=False).lower()
            vid = str(v.get("name") or v.get("id") or v.get("voice") or "").split("/")[-1]
            if not vid or not (vid.startswith("ar") or re.search(r'arabic|"ar-', blob)):
                continue
            sc = 0
            if re.search(r"saudi|ar-sa|hijaz|najd|gulf|khaleeji", blob): sc += 4
            if "commercial" in blob: sc += 3
            if re.search(r"narrat|advertis|promo", blob): sc += 2
            if "advisor" in blob: sc += 1
            if re.search(r'\bmale\b', blob) and "female" not in blob: sc += 1
            found.append((sc, vid))
        if found:
            break
    found.sort(key=lambda x: -x[0])
    seen, out = set(), []
    for sc, vid in found:
        if vid not in seen:
            seen.add(vid); out.append(vid)
    log("أصوات عربية في المكتبة: " + "، ".join(out[:8]))
    return out[:3]


def designed_voices():
    try:
        saved = json.load(open(VOICES_FILE, encoding="utf-8"))
    except Exception:
        saved = {}
    changed = False
    for name, desc in PERSONAS:
        if saved.get(name):
            continue
        variants = [
            {"store": True, "voice": {"type": "prompted", "language_code": "ar-SA", "display_name": name, "model": "gemini-3.8-flash-tts", "prompted": {"input": desc}}},
            {"store": True, "voice": {"type": "prompted", "language_code": "ar-SA", "display_name": name, "prompted": {"input": desc}}},
            {"store": True, "voice": {"type": "prompted", "language_code": "ar-SA", "prompted": {"input": desc}}},
            {"store": True, "voice": {"type": "prompted", "prompted": {"input": desc}}}
        ]
        for body in variants:
            try:
                j = http(API + "/voices", body, {"x-goog-api-key": KEY}, timeout=120)
                vid = j.get("id") or (j.get("voice") or {}).get("id") or str(j.get("name", "")).split("/")[-1]
                if vid:
                    saved[name] = vid
                    changed = True
                    log("صُمّم صوت سعودي جديد: %s ← %s" % (name, vid))
                break
            except urllib.error.HTTPError as e:
                msg = e.read().decode(errors="ignore")
                log("تصميم الصوت %s ← %s %s" % (name, e.code, re.sub(r"\s+", " ", msg)[:140]))
                if e.code == 400 and ("Unknown" in msg or "Invalid" in msg or "invalid" in msg):
                    continue
                break
            except Exception as e:
                log("تصميم الصوت %s: %s" % (name, str(e)[:100]))
                break
    if changed:
        try:
            json.dump(saved, open(VOICES_FILE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        except Exception:
            pass
    return [saved[n] for n, _ in PERSONAS if saved.get(n)]


def load_vlog():
    try:
        return json.load(open(VOICE_LOG, encoding="utf-8"))
    except Exception:
        return {}


LOCK = os.environ.get("TTS_LOCK", "").strip()


def candidates():
    if LOCK:
        log("الصوت المعتمد للعلامة: %s" % LOCK)
        return [LOCK]
    vlog = load_vlog()
    avg = lambda v: (sum(vlog[v][-7:]) / len(vlog[v][-7:])) if vlog.get(v) else None
    lib = []
    try:
        lib = discover_voices()
    except Exception as e:
        log("مكتبة الأصوات: %s" % str(e)[:80])
    mine = []
    try:
        mine = designed_voices()
    except Exception as e:
        log("الأصوات المصممة: %s" % str(e)[:80])
    pool = []
    for v in mine + lib[:2] + [VOICE, "Charon", "Algieba"]:
        if v not in pool:
            pool.append(v)
    known = sorted([v for v in pool if avg(v) is not None], key=lambda v: -avg(v))
    fresh = [v for v in pool if avg(v) is None]
    picks = (known[:1] + fresh + known[1:])[:3]
    log("أصوات للتجربة اليوم: " + "، ".join(picks))
    return picks


def norm_ar(t):
    t = HARAKAT.sub("", str(t)).replace("\u0651", "").replace("\u064B", "")
    t = re.sub("[إأآا]", "ا", t).replace("ى", "ي").replace("ة", "ه").replace("ـ", "")
    return re.findall(r"[\u0621-\u064A]+", t)


def similarity(a, b):
    import difflib
    return difflib.SequenceMatcher(None, norm_ar(a), norm_ar(b)).ratio()


def qa_compare(items, script):
    parts = [{"text": ("You are a strict Saudi commercial voice-over director. Below are %d recordings (A, B, C...) of the SAME Arabic ad script. "
                       "For EACH: transcribe exactly what you hear in Arabic, list mispronounced words, and rate naturalness 1-10: does it sound like a REAL person talking (warm, believable, not an announcer, not robotic)? Also rate saudi 1-10: how authentically SAUDI the accent and intonation are (10 = native Saudi from Hijaz or Najd speaking dialect; 4 = neutral Modern Standard Arabic news style; 2 = Egyptian/Levantine/foreign). Be strict: Fusha-style reading must not exceed 5. "
                       "Then rank them best to worst for a Saudi audience.\n"
                       'Return JSON only: {"items":{"A":{"transcript":"","mispronounced":[],"naturalness":0,"saudi":0,"tags_read":false}},"ranking":["A","B"],"why":"one line"}\n\nScript:\n%s') % (len(items), script)}]
    for label, wav in items:
        mp3 = wav + ".qa.mp3"
        ff(["-i", wav, "-ar", "16000", "-ac", "1", "-b:a", "48k", mp3])
        parts.append({"text": "Recording " + label + ":"})
        parts.append({"inline_data": {"mime_type": "audio/mp3", "data": base64.b64encode(open(mp3, "rb").read()).decode()}})
    for m in QA_MODELS:
        try:
            body = {"contents": [{"parts": parts}], "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"}}
            j = http(API + "/models/" + m + ":generateContent?key=" + KEY, body, timeout=150)
            txt = "".join(p.get("text", "") for p in j["candidates"][0]["content"]["parts"] if not p.get("thought"))
            o = json.loads(re.sub(r"\\u(?![0-9a-fA-F]{4})", r"\\\\u", txt[txt.index("{"):txt.rindex("}") + 1]))
            res, rank = {}, [str(x) for x in (o.get("ranking") or [])]
            for label, _ in items:
                it = (o.get("items") or {}).get(label, {}) or {}
                sim = similarity(it.get("transcript", ""), script) if it.get("transcript") else 0.7
                nat = float(it.get("naturalness") or 6)
                bonus = (len(items) - rank.index(label)) * 0.6 if label in rank else 0
                pen = 0.4 * min(len(it.get("mispronounced") or []), 5) + (3 if it.get("tags_read") else 0)
                sau = float(it.get("saudi") or 5)
                core = (0.25 * nat + 0.45 * sau) if VO_STYLE != "fusha" else 0.6 * nat
                res[label] = {"score": round(max(0, core + 4.0 * sim + bonus - pen), 2), "sim": round(sim, 2), "nat": nat, "saudi": sau,
                              "bad": (it.get("mispronounced") or [])[:6]}
            if o.get("why"):
                log("رأي مخرج الصوت: " + str(o["why"])[:160])
            return res
        except urllib.error.HTTPError as e:
            log("مخرج الصوت %s ← %s" % (m, e.code))
        except Exception as e:
            log("مخرج الصوت %s: %s" % (m, str(e)[:80]))
    return None


def qa_audio(wav, script):
    mp3 = wav + ".qa.mp3"
    ff(["-i", wav, "-ar", "16000", "-ac", "1", "-b:a", "48k", mp3])
    data = base64.b64encode(open(mp3, "rb").read()).decode()
    prompt = ("You are a strict Saudi commercial voice-over director. Listen to this Arabic ad narration and compare it to the intended script below.\n"
              "Score 1-10: overall (would a Saudi ad agency accept it), naturalness (human, not robotic), clarity. Identify the accent (saudi, gulf, levantine, egyptian, msa-neutral, foreign).\n"
              "List Arabic words that were mispronounced, skipped or added, and say if any brackets/tags were read aloud.\n"
              'Return JSON only: {"overall":0,"naturalness":0,"clarity":0,"accent":"","mispronounced":[],"skipped":[],"tags_read":false,"notes":"one short line"}\n\nScript:\n' + script)
    for m in QA_MODELS:
        try:
            body = {"contents": [{"parts": [{"text": prompt}, {"inline_data": {"mime_type": "audio/mp3", "data": data}}]}],
                    "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"}}
            j = http(API + "/models/" + m + ":generateContent?key=" + KEY, body, timeout=90)
            txt = "".join(p.get("text", "") for p in j["candidates"][0]["content"]["parts"] if not p.get("thought"))
            o = json.loads(re.sub(r"\\u(?![0-9a-fA-F]{4})", r"\\\\u", txt[txt.index("{"):txt.rindex("}") + 1]))
            sc = float(o.get("overall", 0))
            sc -= 0.5 * min(len(o.get("mispronounced") or []), 4) + (3 if o.get("tags_read") else 0) + 0.5 * min(len(o.get("skipped") or []), 4)
            o["final"] = round(max(sc, 0), 2)
            return o
        except urllib.error.HTTPError as e:
            log("مراجع الصوت %s ← %s" % (m, e.code))
        except Exception as e:
            log("مراجع الصوت %s: %s" % (m, str(e)[:80]))
    return None


def gemini_interactions(model, text, path):
    body = {"model": model,
            "input": [{"type": "user_input", "content": [{"type": "text", "text": text.replace("\n\n", " <short pause> "),
                                                          "annotations": [{"type": "speech_metadata", "style": STYLE}]}]}],
            "response_format": {"type": "audio"},
            "generation_config": {"speech_config": [{"voice": CUR_VOICE[0]}]}}
    j = http(API + "/interactions", body, {"x-goog-api-key": KEY})
    for st in reversed(j.get("steps", [])):
        for c in reversed(st.get("content", []) or []):
            if c.get("type") == "audio" and c.get("data"):
                return save_audio(base64.b64decode(c["data"]), path, c.get("mime_type", ""))
    return False


def gemini_generate(model, text, path):
    body = {"contents": [{"parts": [{"text": "اقرأ النص التالي بأسلوب " + STYLE + ":\n\n" + text}]}],
            "generationConfig": {"responseModalities": ["AUDIO"],
                                 "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": CUR_VOICE[0]}}}}}
    j = http(API + "/models/" + model + ":generateContent?key=" + KEY, body)
    for p in j["candidates"][0]["content"]["parts"]:
        d = p.get("inlineData") or p.get("inline_data")
        if d and d.get("data"):
            return save_audio(base64.b64decode(d["data"]), path, d.get("mimeType", d.get("mime_type", "")))
    return False


CUR_VOICE = [VOICE]
TTS_MODELS = []


LAST_TTS = [0.0]


def gemini_tts(text, path):
    if not KEY:
        return None
    wait = 21 - (time.time() - LAST_TTS[0])
    if LAST_TTS[0] and wait > 0:
        log("انتظار %d ث (حد الخطة المجانية 3 طلبات صوت في الدقيقة)" % wait)
        time.sleep(wait)
    LAST_TTS[0] = time.time()
    if not TTS_MODELS:
        TTS_MODELS.extend(tts_models())
    for m in TTS_MODELS:
        for fn in (gemini_interactions, gemini_generate):
            for attempt in range(2):
                try:
                    if fn(m, text, path):
                        log("صوت Gemini: %s (%s)" % (m, CUR_VOICE[0]))
                        return m
                    break
                except urllib.error.HTTPError as e:
                    msg = e.read().decode(errors="ignore")[:120]
                    log("%s %s ← %s %s" % (m, fn.__name__, e.code, msg))
                    if e.code == 503 and attempt == 0:
                        time.sleep(20)
                        continue
                    break
                except Exception as e:
                    log("%s %s: %s" % (m, fn.__name__, str(e)[:100]))
                    break
    return None


def silences(path):
    r = subprocess.run(["ffmpeg", "-i", path, "-af", "silencedetect=noise=-38dB:d=0.12", "-f", "null", "-"],
                       capture_output=True, text=True)
    out, cur = [], None
    for line in r.stderr.splitlines():
        m = re.search(r"silence_start: ([\d.]+)", line)
        if m:
            cur = float(m.group(1))
        m = re.search(r"silence_end: ([\d.]+)", line)
        if m and cur is not None:
            out.append((cur, float(m.group(1))))
            cur = None
    if cur is not None:
        out.append((cur, probe(path)))
    return out


def chars(s):
    return max(len(re.sub(r"[\sً-ْٰ.,،؟?!:;«»\"']", "", s)), 1)


def split_narration(path, says):
    dur = probe(path)
    sil = silences(path)
    on = sil[0][1] if sil and sil[0][0] < 0.05 else 0.0
    off = sil[-1][0] if sil and sil[-1][1] >= dur - 0.05 else dur
    inner = [s for s in sil if s[0] > on + 0.1 and s[1] < off - 0.1]
    w = [chars(s) for s in says]
    tot = float(sum(w))
    bounds, used, acc = [], set(), 0
    for i in range(len(says) - 1):
        acc += w[i]
        exp = on + (off - on) * acc / tot
        best = None
        for k, s in enumerate(inner):
            if k in used:
                continue
            mid = (s[0] + s[1]) / 2
            if bounds and mid <= (bounds[-1][0] + bounds[-1][1]) / 2 + 0.3:
                continue
            d = abs(mid - exp)
            if d < 1.2 and (best is None or d < best[0] or (abs(d - best[0]) < 0.25 and (s[1] - s[0]) > (inner[best[1]][1] - inner[best[1]][0]))):
                best = (d, k)
        if best:
            used.add(best[1])
            bounds.append(inner[best[1]])
        else:
            bounds.append((exp, exp))
    segs, prev = [], on
    for b in bounds:
        segs.append((prev, b[0], (b[0] + b[1]) / 2))
        prev = b[1]
    segs.append((prev, off, None))
    return segs, off


def words_for(text, s0, s1):
    ws = text.split()
    if not ws:
        return []
    w = [chars(x) for x in ws]
    tot, acc, out = float(sum(w)), 0.0, []
    for x, c in zip(ws, w):
        a = s0 + (s1 - s0) * acc / tot
        acc += c
        out.append({"w": x, "s": round(a, 3), "e": round(s0 + (s1 - s0) * acc / tot, 3)})
    return out


async def edge(text, path):
    import edge_tts
    for v in EDGE_VOICES:
        try:
            words, audio = [], bytearray()
            com = edge_tts.Communicate(text, v, rate="+4%", boundary="WordBoundary")
            async for ch in com.stream():
                if ch["type"] == "audio":
                    audio.extend(ch["data"])
                elif ch["type"] == "WordBoundary":
                    words.append({"w": ch["text"], "s": ch["offset"] / 1e7, "e": (ch["offset"] + ch["duration"]) / 1e7})
            if len(audio) > 2000:
                open(path, "wb").write(bytes(audio))
                return words
        except Exception as e:
            log("%s: %s" % (v, str(e)[:90]))
    return None


def per_scene(scenes):
    t, voiced, segs, tracks = LEAD, 0, [], []
    for i, s in enumerate(scenes):
        say = s.get("say") or s.get("text", "")
        mp3 = os.path.join(OUT, "v%d.mp3" % i)
        words = None
        try:
            words = asyncio.run(edge(say, mp3))
        except Exception as e:
            log(str(e)[:90])
        if words is not None:
            voiced += 1
            vd = probe(mp3)
            words = words or words_for(say, 0, max(vd - 0.15, 0.5))
            tracks.append((mp3, t))
        else:
            vd = max(1.6, 0.36 * len(say.split()) + 0.4)
            words = words_for(say, 0, vd)
        dur = max(vd + GAP, 1.9)
        s.update(start=round(t, 3), dur=round(dur, 3), words=words)
        segs.append(s)
        t += dur
    return segs, t, tracks, ("edge-tts" if voiced else "silent"), voiced


def narrated(scenes, wav, engine):
    says = [s.get("say") or s.get("text", "") for s in scenes]
    parts, off = split_narration(wav, says)
    starts = [0.0] + [LEAD + p[2] for p in parts[:-1]]
    end = LEAD + off + 0.55
    for i, s in enumerate(scenes):
        st = starts[i]
        nx = starts[i + 1] if i + 1 < len(scenes) else end
        a, b, _ = parts[i]
        s.update(start=round(st, 3), dur=round(nx - st, 3), words=words_for(says[i], LEAD + a - st, LEAD + b - st))
    return scenes, end, [(wav, LEAD)], engine, len(scenes)


def music(total, path):
    tracks = sorted(glob.glob(os.path.join(ROOT, "music", "*.mp3")) + glob.glob(os.path.join(ROOT, "music", "*.m4a")) +
                    glob.glob(os.path.join(ROOT, "music", "*.wav")))
    if os.environ.get("MUSIC", "1") == "0":
        ff(["-f", "lavfi", "-i", "anullsrc=r=%d:cl=mono" % SR, "-t", "%.2f" % total, path])
        return "none"
    if tracks:
        day = int(time.time() // 86400)
        tr = tracks[day % len(tracks)]
        ff(["-stream_loop", "-1", "-i", tr, "-t", "%.2f" % total, "-af",
            "afade=t=in:d=0.4,afade=t=out:st=%.2f:d=1.6,volume=0.55" % max(total - 1.6, 0), "-ar", str(SR), "-ac", "1", path])
        return os.path.basename(tr)
    roots = [220.0, 174.61, 261.63, 196.0]
    bar = 2.2
    chord = lambda f: "(sin(2*PI*%f*t)+0.6*sin(2*PI*%f*t)+0.5*sin(2*PI*%f*t))" % (f / 2, f * 1.1892, f * 1.4983)
    sel = "if(lt(mod(t,%f),%f),%s,if(lt(mod(t,%f),%f),%s,if(lt(mod(t,%f),%f),%s,%s)))" % (
        bar * 4, bar, chord(roots[0]), bar * 4, bar * 2, chord(roots[1]), bar * 4, bar * 3, chord(roots[2]), chord(roots[3]))
    ff(["-f", "lavfi", "-i", "aevalsrc='0.06*%s*(0.8+0.2*sin(2*PI*t/%f))':s=%d:d=%.2f" % (sel, bar, SR, total),
        "-af", "lowpass=f=1800,aecho=0.8:0.7:120:0.3,afade=t=in:d=0.8,afade=t=out:st=%.2f:d=1.4" % max(total - 1.4, 0),
        "-ac", "1", path])
    return "pad"


def sfx():
    ff(["-f", "lavfi", "-i", "aevalsrc='(random(0)*2-1)*sin(PI*t/0.45)^2':s=%d:d=0.45" % SR,
        "-af", "highpass=f=500,lowpass=f=5000,volume=0.6", "-ac", "1", os.path.join(OUT, "whoosh.wav")])
    ff(["-f", "lavfi", "-i", "aevalsrc='0.4*(sin(2*PI*1318.5*t)+0.6*sin(2*PI*1975.5*t))*exp(-t*5)':s=%d:d=1.2" % SR,
        "-ac", "1", os.path.join(OUT, "ding.wav")])


def main():
    data = json.load(open(SRC, encoding="utf-8"))
    scenes = data.get("scenes", [])[:6]
    os.makedirs(OUT, exist_ok=True)
    for sc in scenes:
        sc["say"] = clean_tts(sc.get("say") or sc.get("text", ""))
    script = "\n\n".join(sc["say"] for sc in scenes)
    wav = os.path.join(OUT, "narration.wav")
    model, best, report = None, None, []
    takes = []
    cands = candidates() if KEY else []
    for v in cands:
        CUR_VOICE[0] = v
        tmp = os.path.join(OUT, "narr_%s.wav" % re.sub(r"\W", "_", v))
        m = gemini_tts(script.replace("المنجز", BRAND_SAY) if BRAND_SAY else script, tmp)
        if m:
            takes.append((v, tmp, m))
    if not takes and LOCK and KEY:
        log("الصوت المعتمد لم يعمل اليوم — نجرّب البدائل")
        for v in [x for x in (designed_voices() + [VOICE, "Charon"]) if x != LOCK][:2]:
            CUR_VOICE[0] = v
            tmp = os.path.join(OUT, "narr_%s.wav" % re.sub(r"\W", "_", v))
            m = gemini_tts(script.replace("المنجز", BRAND_SAY) if BRAND_SAY else script, tmp)
            if m:
                takes.append((v, tmp, m))
    if takes:
        labels = "ABCDE"
        res = qa_compare([(labels[i], t[1]) for i, t in enumerate(takes)], script) if len(takes) > 1 else None
        for i, (v, tmp, m) in enumerate(takes):
            r = (res or {}).get(labels[i])
            if not r:
                q = qa_audio(tmp, script)
                r = {"score": q["final"] if q else 6.0, "sim": None, "nat": q.get("naturalness") if q else None, "bad": (q or {}).get("mispronounced") or []}
            log("تقييم صوت %s: %s (تطابق النص %s، طبيعية %s، سعودية اللهجة %s)%s" % (v, r["score"], r["sim"], r["nat"], r.get("saudi"), (" — أخطاء: " + "، ".join(r["bad"])[:90]) if r["bad"] else ""))
            report.append({"voice": v, "score": r["score"]})
            if not best or r["score"] > best[0]:
                best = (r["score"], v, tmp, m)
    if best:
        shutil.copy(best[2], wav)
        model = best[3]
        log("الصوت المختار: %s (%s/10)" % (best[1], best[0]))
        vlog = load_vlog()
        for r in report:
            vlog.setdefault(r["voice"], []).append(r["score"])
            vlog[r["voice"]] = vlog[r["voice"]][-20:]
        try:
            json.dump(vlog, open(VOICE_LOG, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        except Exception:
            pass
    if model:
        segs, t, tracks, engine, voiced = narrated(scenes, wav, model)
    else:
        log("Gemini TTS غير متاح — الصوت الاحتياطي")
        segs, t, tracks, engine, voiced = per_scene(scenes)
    total = t + OUTRO
    mtrack = music(total, os.path.join(OUT, "music.wav"))
    sfx()

    inputs, filt, mix, vparts, k = ["-i", os.path.join(OUT, "music.wav")], [], [], [], 1
    for p, d in tracks:
        inputs += ["-i", p]
        ms = int(d * 1000)
        filt.append("[%d:a]aresample=%d,aformat=channel_layouts=mono,adelay=%d|%d,volume=1.5[v%d]" % (k, SR, ms, ms, k))
        vparts.append("[v%d]" % k)
        k += 1
    for s in segs[1:] + [{"start": t}]:
        inputs += ["-i", os.path.join(OUT, "whoosh.wav")]
        ms = max(int((s["start"] - 0.22) * 1000), 0)
        filt.append("[%d:a]adelay=%d|%d,volume=0.45[w%d]" % (k, ms, ms, k))
        mix.append("[w%d]" % k)
        k += 1
    inputs += ["-i", os.path.join(OUT, "ding.wav")]
    ms = int((t + 0.35) * 1000)
    filt.append("[%d:a]adelay=%d|%d,volume=0.4[dg]" % (k, ms, ms))
    mix.append("[dg]")
    if vparts:
        filt.append("%samix=inputs=%d:normalize=0,apad=whole_dur=%.2f,asplit=2[voice][sc]" % ("".join(vparts), len(vparts), total))
        filt.append("[0:a][sc]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=400[bed]")
        mix = ["[bed]", "[voice]"] + mix
    else:
        filt.append("[0:a]volume=1.2[bed]")
        mix = ["[bed]"] + mix
    filt.append("%samix=inputs=%d:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,atrim=0:%.2f[out]" % ("".join(mix), len(mix), total))
    ff(inputs + ["-filter_complex", ";".join(filt), "-map", "[out]", "-ar", str(SR), "-ac", "2", os.path.join(OUT, "mix.wav")])

    tl = {"total": round(total, 3), "outro": round(t, 3), "trade": data.get("trade", ""), "voiced": voiced,
          "engine": engine, "music": mtrack, "scenes": segs}
    json.dump(tl, open(os.path.join(OUT, "timeline.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    log("المدة %.1f ث — المحرك: %s — الموسيقى: %s" % (total, engine, mtrack))
    return 0


if __name__ == "__main__":
    sys.exit(main())
