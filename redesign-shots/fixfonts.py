"""One-off: raise the micro-typography floor in global.css.

The dense 7-9px micro-labels are the main "vibe-coded slop" signature.
Map: 7/7.5/8/8.5 -> 10px, 9/9.5 -> 11px. Leaves >=10px untouched.
"""
import re
import pathlib

p = pathlib.Path(__file__).resolve().parent.parent / "src" / "styles" / "global.css"
s = p.read_text(encoding="utf-8")

print("file:", p)
print("has 'font-size: 7px'?", "font-size: 7px" in s)

probe = re.search(r"font-size:\s*7(?:\.\d+)?px", s)
print("probe match:", probe.group(0) if probe else None)

mapping = [
    (r"font-size:\s*7(?:\.\d+)?px",   "font-size: 10px"),
    (r"font-size:\s*8(?:\.\d+)?px",   "font-size: 10px"),
    (r"font-size:\s*9(?:\.\d+)?px",   "font-size: 11px"),
]

total = 0
for pat, rep in mapping:
    s, n = re.subn(pat, rep, s)
    total += n
    print(f"{pat!r:44} -> {rep!r:20} replaced {n}")

p.write_text(s, encoding="utf-8")

for size in ["7", "7.5", "8", "8.5", "9", "9.5"]:
    left = len(re.findall(r"font-size:\s*" + re.escape(size) + r"px", s))
    if left:
        print(f"WARNING still {left} at {size}px")

print("total replaced:", total)
print("10px:", len(re.findall(r"font-size: 10px", s)), "| 11px:", len(re.findall(r"font-size: 11px", s)))
