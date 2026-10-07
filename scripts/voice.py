import asyncio, json, os, subprocess, sys

ROOT = os.getcwd()
SRC = os.path.join(ROOT, "social", "reel.json")
OUT = os.environ.get("REEL_OUT", os.path.join(ROOT, "reel_out"))
VOICES = ["ar-SA-HamedNeural", "ar-SA-ZariyahNeural"]
SR = 44100
OUTRO = 2.2
LEAD = 0.08
GAP = 0.3
BPM = 112


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


async def edge(text, path):
    import edge_tts
    for v in VOICES:
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


def gtts(text, path):
    try:
        from gtts import gTTS
        gTTS(text, lang="ar").save(path)
        return os.path.getsize(path) > 2000
    except Exception as e:
        log("gTTS: %s" % str(e)[:90])
        return False


def even(text, dur):
    ws = text.split()
    if not ws:
        return []
    step = dur / len(ws)
    return [{"w": w, "s": i * step, "e": (i + 1) * step} for i, w in enumerate(ws)]


def music(total, path):
    beat = 60.0 / BPM
    bar = beat * 4
    roots = [220.0, 174.61, 261.63, 196.0]
    def chord(f):
        return "(sin(2*PI*%f*t)+0.7*sin(2*PI*%f*t)+0.6*sin(2*PI*%f*t)+0.25*sin(2*PI*%f*t))" % (f / 2, f * 1.1892, f * 1.4983, f * 2)
    sel = "if(lt(mod(t,%f),%f),%s,if(lt(mod(t,%f),%f),%s,if(lt(mod(t,%f),%f),%s,%s)))" % (
        bar * 4, bar, chord(roots[0]), bar * 4, bar * 2, chord(roots[1]), bar * 4, bar * 3, chord(roots[2]), chord(roots[3]))
    pad = "0.055*%s*(0.75+0.25*sin(2*PI*t/%f))" % (sel, bar)
    ph = "mod(t,%f)" % beat
    kick = "0.32*sin(2*PI*(45+90*exp(-%s*30))*%s)*exp(-%s*9)" % (ph, ph, ph)
    hph = "mod(t+%f,%f)" % (beat / 2, beat)
    hat = "0.03*(random(0)*2-1)*exp(-%s*70)" % hph
    expr = "%s+%s+%s" % (pad, kick, hat)
    ff(["-f", "lavfi", "-i", "aevalsrc='%s':s=%d:d=%.2f" % (expr, SR, total),
        "-af", "highpass=f=35,lowpass=f=7000,afade=t=in:d=0.6,afade=t=out:st=%.2f:d=1.2" % max(total - 1.2, 0),
        "-ac", "1", path])


def whoosh(path):
    ff(["-f", "lavfi", "-i", "aevalsrc='(random(0)*2-1)*sin(PI*t/0.45)^2':s=%d:d=0.45" % SR,
        "-af", "highpass=f=400,lowpass=f=6000,volume=0.9", "-ac", "1", path])


def ding(path):
    ff(["-f", "lavfi", "-i", "aevalsrc='0.4*(sin(2*PI*1318.5*t)+0.6*sin(2*PI*1975.5*t))*exp(-t*5)':s=%d:d=1.2" % SR,
        "-ac", "1", path])


def main():
    data = json.load(open(SRC, encoding="utf-8"))
    scenes = data.get("scenes", [])[:6]
    os.makedirs(OUT, exist_ok=True)
    t, voiced, segs = LEAD, 0, []
    for i, s in enumerate(scenes):
        say = s.get("say") or s.get("text", "")
        mp3 = os.path.join(OUT, "v%d.mp3" % i)
        words = None
        try:
            words = asyncio.run(edge(say, mp3))
        except Exception as e:
            log(str(e)[:90])
        ok = words is not None
        if not ok and gtts(say, mp3):
            ok = True
        if ok:
            voiced += 1
            vd = probe(mp3)
            if not words:
                words = even(say, max(vd - 0.15, 0.5))
        else:
            vd = max(1.6, 0.36 * len(say.split()) + 0.4)
            words = even(say, vd)
            mp3 = None
        dur = max(vd + GAP, 1.9)
        s["start"], s["dur"], s["words"], s["audio"] = round(t, 3), round(dur, 3), words, mp3
        segs.append(s)
        t += dur
    total = t + OUTRO

    if os.environ.get("MUSIC", "1") == "0":
        ff(["-f", "lavfi", "-i", "anullsrc=r=%d:cl=mono" % SR, "-t", "%.2f" % total, os.path.join(OUT, "music.wav")])
    else:
        music(total, os.path.join(OUT, "music.wav"))
    whoosh(os.path.join(OUT, "whoosh.wav"))
    ding(os.path.join(OUT, "ding.wav"))

    inputs, filt, mix = ["-i", os.path.join(OUT, "music.wav")], [], []
    k = 1
    vparts = []
    for s in segs:
        if s["audio"]:
            inputs += ["-i", s["audio"]]
            d = int(s["start"] * 1000)
            filt.append("[%d:a]aresample=%d,aformat=channel_layouts=mono,adelay=%d|%d,volume=1.6[v%d]" % (k, SR, d, d, k))
            vparts.append("[v%d]" % k)
            k += 1
    for s in segs[1:] + [{"start": t}]:
        inputs += ["-i", os.path.join(OUT, "whoosh.wav")]
        d = max(int((s["start"] - 0.22) * 1000), 0)
        filt.append("[%d:a]adelay=%d|%d,volume=0.7[w%d]" % (k, d, d, k))
        mix.append("[w%d]" % k)
        k += 1
    inputs += ["-i", os.path.join(OUT, "ding.wav")]
    d = int((t + 0.35) * 1000)
    filt.append("[%d:a]adelay=%d|%d,volume=0.45[dg]" % (k, d, d))
    mix.append("[dg]")
    if vparts:
        filt.append("%samix=inputs=%d:normalize=0,apad=whole_dur=%.2f,asplit=2[voice][sc]" % ("".join(vparts), len(vparts), total))
        filt.append("[0:a][sc]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=350[bed]")
        mix = ["[bed]", "[voice]"] + mix
    else:
        filt.append("[0:a]volume=1.4[bed]")
        mix = ["[bed]"] + mix
    filt.append("%samix=inputs=%d:normalize=0,alimiter=limit=0.9,atrim=0:%.2f[out]" % ("".join(mix), len(mix), total))
    ff(inputs + ["-filter_complex", ";".join(filt), "-map", "[out]", "-ar", str(SR), "-ac", "2",
                 os.path.join(OUT, "mix.wav")])

    tl = {"total": round(total, 3), "outro": round(t, 3), "trade": data.get("trade", ""), "voiced": voiced,
          "scenes": [{k2: v for k2, v in s.items() if k2 != "audio"} for s in segs]}
    json.dump(tl, open(os.path.join(OUT, "timeline.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    log("المدة %.1f ث — %d/%d مشاهد بصوت" % (total, voiced, len(segs)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
