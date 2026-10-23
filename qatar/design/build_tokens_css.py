"""Generates qatar/web/tokens.css from qatar/design/tokens.json (single source of truth). Run: python3 build_tokens_css.py"""
import json
import pathlib

HERE = pathlib.Path(__file__).parent
t = json.loads((HERE / "tokens.json").read_text())


def colors(theme):
    return "\n".join(f"  --c-{k}: {v['$value']};" for k, v in t["color"][theme].items())


def ref(v):
    if isinstance(v, str) and v.startswith("{font.family."):
        return "var(--font-" + v[len("{font.family."):-1] + ")"
    if isinstance(v, str) and v.startswith("{font.weight."):
        return str(t["font"]["weight"][v[len("{font.weight."):-1]]["$value"])
    return v


def type_vars(lang):
    out = []
    for role, spec in t["type"][lang].items():
        if role.startswith("$"):
            continue
        val = spec["$value"]
        out.append(f"  --t-{role}-size: {val['fontSize']}; --t-{role}-lh: {val['lineHeight']}; "
                   f"--t-{role}-weight: {ref(val['fontWeight'])}; --t-{role}-ls: {val['letterSpacing']};")
    return "\n".join(out)


fam = lambda k: ", ".join(f'"{f}"' if " " in f else f for f in t["font"]["family"][k]["$value"])
space = "\n".join(f"  --s-{k}: {v['$value']};" for k, v in t["space"].items() if not k.startswith("$"))
radius = "\n".join(f"  --r-{k}: {v['$value']};" for k, v in t["radius"].items())
shadow = "\n".join(f"  --e-{k}: {v['$value']['offsetX']} {v['$value']['offsetY']} {v['$value']['blur']} {v['$value']['spread']} {v['$value']['color']};"
                   for k, v in t["elevation"].items() if v.get("$type") == "shadow")
motion = "\n".join(f"  --m-{k}: {v['$value']};" for k, v in t["motion"].items() if v.get("$type") == "duration")
ease = "cubic-bezier(" + ", ".join(str(x) for x in t["motion"]["easing"]["$value"]) + ")"

css = f"""/* GENERATED from qatar/design/tokens.json by build_tokens_css.py — do not edit by hand. */
:root {{
{colors("light")}
  --font-ar: {fam("ar")};
  --font-en: {fam("en")};
  --font-numeric: {fam("numeric")};
{space}
{radius}
{shadow}
{motion}
  --m-ease: {ease};
  color-scheme: light dark;
}}
@media (prefers-color-scheme: dark) {{
  :root:not([data-theme="light"]) {{
{colors("dark")}
  }}
}}
:root[data-theme="dark"] {{
{colors("dark")}
}}
:root[lang="ar"] {{
  --font-body: var(--font-ar);
{type_vars("ar")}
}}
:root[lang="en"] {{
  --font-body: var(--font-en);
{type_vars("en")}
}}
@media (prefers-reduced-motion: reduce) {{
  :root {{ --m-fast: 0ms; --m-base: 0ms; --m-slow: 0ms; }}
}}
"""
(HERE.parent / "web" / "tokens.css").write_text(css)
print("wrote", HERE.parent / "web" / "tokens.css")
