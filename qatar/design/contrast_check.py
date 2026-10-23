"""Checks WCAG 2.1 contrast for every text/background pair declared in tokens.json. Exit 1 on failure."""
import json, sys

def lum(hex_):
    h = hex_.lstrip("#")
    rgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]

def ratio(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)

tokens = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "tokens.json"))
fail = 0
for theme in ("light", "dark"):
    c = {k: v["$value"] for k, v in tokens["color"][theme].items()}
    for fg, bg, minimum in tokens["$contrastPairs"]:
        r = ratio(c[fg], c[bg])
        ok = r >= minimum
        fail += not ok
        print(f"{theme:5} {fg:18} on {bg:12} {r:5.2f}:1  need {minimum}  {'PASS' if ok else 'FAIL'}")
sys.exit(1 if fail else 0)
