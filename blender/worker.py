"""Bounded Blender operations. Launched with --background --disable-autoexec.

Requests and outputs live in a unique job directory. Existing .blend files are
read only; every mutation saves a new file. No generated Python is evaluated.
"""
import json
import math
import sys
import traceback
from pathlib import Path

import bpy
from mathutils import Vector


def require_object(name, kind):
    obj = bpy.data.objects.get(name)
    if obj is None or obj.type != kind:
        raise ValueError(f"Select an existing {kind} object by name: {name}")
    return obj


def inspect():
    objects = []
    for obj in list(bpy.context.scene.objects)[:128]:
        if obj.type == "MESH":
            bounds = [obj.matrix_world @ Vector(p) for p in obj.bound_box]
            objects.append({"name": obj.name, "kind": "MESH", "vertices": len(obj.data.vertices),
                            "bounds": [[min(p[i] for p in bounds) for i in range(3)],
                                       [max(p[i] for p in bounds) for i in range(3)]],
                            "armatures": [m.object.name for m in obj.modifiers if m.type == "ARMATURE" and m.object]})
        elif obj.type == "ARMATURE":
            objects.append({"name": obj.name, "kind": "ARMATURE", "bones": [
                {"name": b.name, "parent": b.parent.name if b.parent else None,
                 "head": list(obj.matrix_world @ b.head_local), "tail": list(obj.matrix_world @ b.tail_local)}
                for b in list(obj.data.bones)[:256]]})
    return {"objects": objects, "truncated": len(bpy.context.scene.objects) > 128,
            "blenderVersion": bpy.app.version_string}


def humanoid_guides(mesh):
    bounds = [mesh.matrix_world @ Vector(p) for p in mesh.bound_box]
    lo = Vector([min(p[i] for p in bounds) for i in range(3)])
    hi = Vector([max(p[i] for p in bounds) for i in range(3)])
    w, h = hi.x - lo.x, hi.z - lo.z
    if min(w, h) < 0.001:
        raise ValueError("Mesh needs non-zero width and height. Use a Z-up, T-pose humanoid.")
    cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
    def p(x, z, y=0):
        return [cx + x * w, cy + y * h, lo.z + z * h]
    guides = {"root": p(0, .48), "hips": p(0, .52), "chest": p(0, .72),
              "neck": p(0, .84), "head": p(0, .98)}
    for side, sign in [("Left", 1), ("Right", -1)]:
        guides.update({f"{side}Shoulder": p(sign * .16, .80),
                       f"{side}Elbow": p(sign * .32, .80),
                       f"{side}Wrist": p(sign * .44, .80),
                       f"{side}HandTip": p(sign * .50, .80),
                       f"{side}Hip": p(sign * .07, .50),
                       f"{side}Knee": p(sign * .07, .28),
                       f"{side}Ankle": p(sign * .07, .06),
                       f"{side}Toe": p(sign * .07, .04, -.10)})
    return guides


def weight_report(mesh, armature):
    deform_names = {bone.name for bone in armature.data.bones if bone.use_deform}
    valid = {group.index for group in mesh.vertex_groups if group.name in deform_names}
    unweighted, over_four, not_normalized = 0, 0, 0
    for vertex in mesh.data.vertices:
        weights = [g.weight for g in vertex.groups if g.group in valid and g.weight > 1e-6]
        unweighted += not weights
        over_four += len(weights) > 4
        not_normalized += bool(weights) and abs(sum(weights) - 1) > .001
    return {"vertices": len(mesh.data.vertices), "unweighted": unweighted,
            "overFourInfluences": over_four, "notNormalized": not_normalized}


def rig_humanoid(request):
    mesh = require_object(request["mesh"], "MESH")
    if mesh.parent or any(m.type == "ARMATURE" for m in mesh.modifiers):
        raise ValueError("Mesh already has a parent or armature. Start from an unrigged mesh copy.")
    if len(mesh.data.vertices) > 200000:
        raise ValueError("First-version rigging supports at most 200,000 vertices.")
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    guides = humanoid_guides(mesh)
    for key, value in request.get("landmarks", {}).items():
        if key not in guides:
            raise ValueError(f"Unknown landmark {key}. Valid landmarks: {', '.join(guides)}")
        guides[key] = value
    bpy.ops.object.select_all(action="DESELECT")
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    arm_data = bpy.data.armatures.new(request.get("name", "MotionRig"))
    arm = bpy.data.objects.new(arm_data.name, arm_data)
    bpy.context.collection.objects.link(arm)
    arm.show_in_front = True
    mesh.select_set(False)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    def bone(name, start, end, parent=None):
        b = arm_data.edit_bones.new(name)
        b.head, b.tail = guides[start], guides[end]
        if (b.tail - b.head).length < .00001:
            raise ValueError(f"Bone {name} has zero length; adjust its landmarks.")
        if parent:
            b.parent = arm_data.edit_bones[parent]
    bone("Root", "root", "hips")
    bone("LowerTorso", "hips", "chest", "Root")
    bone("UpperTorso", "chest", "neck", "LowerTorso")
    bone("Head", "neck", "head", "UpperTorso")
    for side in ("Left", "Right"):
        bone(side + "UpperArm", side + "Shoulder", side + "Elbow", "UpperTorso")
        bone(side + "LowerArm", side + "Elbow", side + "Wrist", side + "UpperArm")
        bone(side + "Hand", side + "Wrist", side + "HandTip", side + "LowerArm")
        bone(side + "UpperLeg", side + "Hip", side + "Knee", "LowerTorso")
        bone(side + "LowerLeg", side + "Knee", side + "Ankle", side + "UpperLeg")
        bone(side + "Foot", side + "Ankle", side + "Toe", side + "LowerLeg")
    bpy.ops.object.mode_set(mode="OBJECT")
    report = None
    if request.get("bind", True):
        mesh.select_set(True)
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.parent_set(type="ARMATURE_AUTO")
        # Keep only the four largest deform influences and normalize them.
        names = {b.name for b in arm.data.bones}
        valid = {g.index: g for g in mesh.vertex_groups if g.name in names}
        for vertex in mesh.data.vertices:
            influences = sorted([(g.group, g.weight) for g in vertex.groups if g.group in valid], key=lambda x: x[1], reverse=True)
            kept = [(index, weight) for index, weight in influences[:4] if weight > 1e-6]
            total = sum(weight for _, weight in kept)
            for index, _ in influences:
                valid[index].remove([vertex.index])
            for index, weight in kept:
                valid[index].add([vertex.index], weight / total, "REPLACE")
        report = weight_report(mesh, arm)
    return {"armature": arm.name, "mesh": mesh.name, "landmarks": guides, "weights": report,
            "needsVisualReview": True, "note": "Approximate T-pose humanoid guide. Inspect elbows, shoulders, hips, and knees before export."}


def animate(request):
    arm = require_object(request["armature"], "ARMATURE")
    recipe = request["recipe"]
    mapping = request.get("jointMap", {})
    names = [mapping.get(t["joint"], t["joint"]) for t in recipe["tracks"]]
    if len(set(names)) != len(names):
        raise ValueError("Multiple tracks map to the same bone.")
    for name in names:
        if name not in arm.pose.bones:
            raise ValueError(f"Bone not found: {name}. Inspect the armature and supply jointMap.")
    for name in names:
        if any(not c.mute and c.influence > 0 for c in arm.pose.bones[name].constraints):
            raise ValueError(f"Bone {name} has active constraints. Bake or disable its control constraints in a copy before applying direct bone animation.")
    arm.animation_data_create()
    for track in arm.animation_data.nla_tracks:
        track.mute = True
    arm.animation_data.action_blend_type = "REPLACE"
    arm.animation_data.action_influence = 1.0
    arm.animation_data.action = bpy.data.actions.new(recipe["name"])
    fps = 30
    bpy.context.scene.render.fps = fps
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = math.ceil(recipe["duration"] * fps) + 1
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"
        pb.location = (0, 0, 0)
        pb.rotation_euler = (0, 0, 0)
        pb.scale = (1, 1, 1)
    for track, name in zip(recipe["tracks"], names):
        pb = arm.pose.bones[name]
        for key in track["keys"]:
            frame = 1 + key["time"] * fps
            pb.location = key["position"]
            pb.rotation_euler = [math.radians(x) for x in key["rotation"]]
            pb.keyframe_insert("location", frame=frame, group=name)
            pb.keyframe_insert("rotation_euler", frame=frame, group=name)
    action = arm.animation_data.action
    # Blender 4.4+ actions use layers/slots; 4.3 and earlier expose fcurves.
    if hasattr(action, "layers") and len(action.layers):
        curves = [curve for layer in action.layers for strip in layer.strips
                  for bag in strip.channelbags for curve in bag.fcurves]
    else:
        curves = list(action.fcurves)
    for curve in curves:
        for key in curve.keyframe_points:
            key.interpolation = "LINEAR"
    for marker in recipe.get("markers", []):
        action.pose_markers.new(marker["name"]).frame = round(1 + marker["time"] * fps)
    action["MotionLoop"] = recipe["loop"]
    bpy.context.scene.frame_set(1)
    return {"armature": arm.name, "action": action.name, "curves": len(curves),
            "duration": recipe["duration"], "note": "Rotations are local to each bone. Cross-rig axis retargeting is not automatic."}


def export_fbx(request, directory):
    arm = require_object(request["armature"], "ARMATURE")
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    meshes = []
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH" and any(m.type == "ARMATURE" and m.object == arm for m in obj.modifiers):
            report = weight_report(obj, arm)
            if report["unweighted"] or report["overFourInfluences"] or report["notNormalized"]:
                raise ValueError(f"Fix skin weights before export: {obj.name}: {report}")
            obj.select_set(True)
            meshes.append(obj.name)
    if not meshes:
        raise ValueError("Armature has no bound mesh. Bind and inspect weights before export.")
    path = directory / "export.fbx"
    bpy.ops.export_scene.fbx(filepath=str(path), use_selection=True, object_types={"ARMATURE", "MESH"},
                             add_leaf_bones=False, bake_anim=True, bake_anim_use_nla_strips=False,
                             bake_anim_use_all_actions=False, bake_anim_force_startend_keying=False,
                             bake_anim_simplify_factor=0.0, apply_scale_options="FBX_SCALE_UNITS",
                             axis_forward="-Z", axis_up="Y", use_custom_props=True)
    return {"fbx": str(path), "meshes": meshes,
            "note": "One active clip exported. Verify scale and animation in Roblox's importer; upload is manual."}


def main():
    request_path = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
    directory = request_path.parent
    request = json.loads(request_path.read_text(encoding="utf-8"))
    try:
        op = request["operation"]
        if op == "inspect":
            result = inspect()
        elif op == "rig_humanoid":
            result = rig_humanoid(request)
        elif op == "animate":
            result = animate(request)
        elif op == "export_fbx":
            result = export_fbx(request, directory)
        else:
            raise ValueError("Unsupported Blender operation.")
        if op != "inspect":
            output = directory / "output.blend"
            bpy.ops.wm.save_as_mainfile(filepath=str(output))
            result["blendFile"] = str(output)
        (directory / "result.json").write_text(json.dumps({"ok": True, "result": result}, indent=2), encoding="utf-8")
    except Exception as error:
        (directory / "result.json").write_text(json.dumps({"ok": False, "error": str(error)}), encoding="utf-8")
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
