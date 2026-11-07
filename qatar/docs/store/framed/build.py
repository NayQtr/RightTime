"""Store screenshot frames: caption above the real app screenshot.
Colours come from qatar/design/tokens.json (dark.bg #3A2C39 frame, dark.text #FBF1F8 caption).
Captions: the five the owner approved on 7 Nov (Arabic only)."""
import base64, json, sys

ROOT = sys.argv[1]   # repo root
OUT = sys.argv[2]    # output dir
tok = json.load(open(f"{ROOT}/qatar/design/tokens.json", encoding="utf-8"))["color"]
BG = tok["dark"]["bg"]["$value"]
INK = tok["dark"]["text"]["$value"]

shots = [
    ("01_welcome", "تعرّفي على ناس.. تفهمك"),
    ("03_sessions", "طاولة من 4 إلى 6 سيدات، بلغتك وضمن ميزانيتك"),
    ("04_meetup", "كل التفاصيل قبل موعدك"),
    ("06_book", "احجزي مقعدك بخطوات قليلة"),
    ("07_account", "مساحتك، بخصوصيتك"),
]
devices = {
    # canvas, caption block height, caption font size, screenshot width, radius
    "ios-6.9": dict(w=1320, h=2868, cap=600, fs=92, sw=1010, r=72),
    "android-phone": dict(w=1080, h=1920, cap=420, fs=66, sw=790, r=48),
}

for dev, d in devices.items():
    slides = []
    for name, cap in shots:
        b64 = base64.b64encode(open(f"{ROOT}/qatar/docs/store/screenshots/{dev}/{name}.png", "rb").read()).decode()
        slides.append(f'''<section class="slide" id="{name}" data-canvas-width="{d['w']}" data-canvas-height="{d['h']}">
  <h1>{cap}</h1>
  <img alt="" src="data:image/png;base64,{b64}">
</section>''')
    html = f'''<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="hz:slide-selector" content=".slide">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Alexandria:wght@600&display=block" rel="stylesheet">
<title>HerZone store screenshots {dev}</title>
<style>
  * {{ margin:0; box-sizing:border-box; }}
  body {{ background:#000; }}
  .slide {{ width:{d['w']}px; height:{d['h']}px; background:{BG}; position:relative; overflow:hidden; display:block; }}
  .slide h1 {{ position:absolute; top:0; left:0; right:0; height:{d['cap']}px; display:flex; align-items:center; justify-content:center;
    padding:0 {int(d['w']*0.09)}px; text-align:center; color:{INK}; font-family:Alexandria, sans-serif; font-weight:600;
    font-size:{d['fs']}px; line-height:1.35; text-wrap:balance; }}
  .slide img {{ position:absolute; top:{d['cap']}px; left:{(d['w']-d['sw'])//2}px; width:{d['sw']}px; height:auto;
    border-radius:{d['r']}px; outline:{max(2, d['w']//440)}px solid rgba(251,241,248,.18); }}
</style></head><body>
{chr(10).join(slides)}
</body></html>'''
    open(f"{OUT}/{dev}.html", "w", encoding="utf-8").write(html)
    print(dev, len(html) // 1024, "KB")
