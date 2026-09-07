"""Native engine assertions beyond merely checking that files were written."""
import json
import sys
from pathlib import Path
import bpy

directory = Path(sys.argv[sys.argv.index("--") + 1])
summary = json.loads((directory / "results.json").read_text(encoding="utf-8"))
mesh = bpy.data.objects["FixtureBody"]

def positions(frame):
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()
    evaluated = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
    return [evaluated.matrix_world @ v.co for v in evaluated.data.vertices]

start, cast = positions(1), positions(46)
movement = max((a - b).length for a, b in zip(start, cast))
assert movement > .1, f"Animation did not deform the skinned mesh: {movement}"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=summary["exported"]["fbx"])
armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
assert len(armatures) == 1, "FBX roundtrip lost the armature"
arm = armatures[0]
assert len(arm.data.bones) == 16, "FBX roundtrip changed the bone count"
assert arm.animation_data and arm.animation_data.action, "FBX roundtrip lost animation"
assert any(obj.type == "MESH" for obj in bpy.context.scene.objects), "FBX roundtrip lost the mesh"
report = {"maximumVertexMovement": movement, "fbxRoundtripBones": len(arm.data.bones), "fbxHasAnimation": True}
(directory / "native-verification.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print("Native deformation and FBX roundtrip verified:", report)
