#!/usr/bin/env python3
from pathlib import Path
import re
html_path = Path("/workspace/midas/apps/api/src/product-app.html")
text = html_path.read_text()
nav_pat = re.compile("const FOUNDER_NAV = \\[[\\s\\S]*?\\];\\nconst NAV = \\[[\\s\\S]*?\\];")
new_nav = """const PRIMARY_NAV = [
  [\"overview\",\"Overview\"],
  [\"companies\",\"Companies\"],
  [\"opportunities\",\"Opportunities\"],
  [\"teams\",\"Team\"],
  [\"employees\",\"Employees\"],
  [\"training\",\"Training\"],
  [\"research\",\"Research\"],
  [\"work\",\"Work\"],
  [\"deliverables\",\"Deliverables\"],
  [\"approvals\",\"Approvals\"],
  [\"treasury\",\"Treasury\"],
  [\"launch-readiness\",\"Launch Readiness\"],
  [\"settings\",\"Settings\"],
  [\"diagnostics\",\"Diagnostics\"]
];
const FOUNDER_NAV = PRIMARY_NAV;
const NAV = PRIMARY_NAV;"""
text2, n = nav_pat.subn(new_nav, text, count=1)
print("nav_n", n)
assert n==1
html_path.write_text(text2)
print("nav-ok", len(text2))
