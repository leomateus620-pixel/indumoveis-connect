"""Emit self-contained Blender Python for either Higgsfield 3D Jutsu operation."""

import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("stage", choices=("layout", "exhibition"))
stage = parser.parse_args().stage
here = Path(__file__).resolve().parent
project = here.parents[2]
plan = json.loads(
    (project / "src/features/pavilion-interior/plan.generated.json").read_text()
)
print("PLAN =", repr(plan))
layout = (here / "scene.py").read_text()
if stage == "layout":
    print(layout)
else:
    print(layout.split("for obj in list(bpy.data.objects):")[0])
    for source in ("materials.py", "geometry.py", "architecture.py", "curation.py"):
        print((here / source).read_text())
