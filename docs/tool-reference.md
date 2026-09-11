# Tool reference

## MCP tools

| Tools | Purpose |
| --- | --- |
| `motion_capabilities` | List presets, operations, and limits |
| `motion_workflow_start`, `motion_workflow_list`, `motion_workflow_read` | Start and resume briefs and staged authoring for models, animation and VFX |
| `motion_workflow_revise_brief` | Preserve feedback or a revised approach and restart stage review |
| `motion_workflow_attach_candidate`, `motion_workflow_read_evidence`, `motion_workflow_review` | Attach fingerprinted files, inspect images, and record requirement and exclusion findings |
| `motion_library_list`, `motion_library_read`, `motion_library_save` | Browse recipes and save immutable revisions |
| `motion_review_start`, `motion_review_read`, `motion_review_feedback` | Inspect a version on its Studio rig, ask the user for feedback, and save the user's decision |
| `motion_animation_create`, `motion_vfx_create` | Create editable starter recipes |
| `motion_studio_sessions`, `motion_studio_inspect` | Find selected rigs and inspect their joints |
| `motion_studio_connect_parts` | Add a Motor6D between rigid parts |
| `motion_studio_save_animation`, `motion_studio_save_vfx` | Save native objects with undo recordings |
| `motion_studio_preview`, `motion_studio_stop_preview` | Preview animation and timed effects on a clone |
| `motion_studio_job` | Check a queued command's result |
| `motion_studio_capture_frame`, `motion_studio_capture_chunk` | Experimental frozen pose capture and PNG retrieval; unsupported in the tested Studio runtime |
| `motion_blender_inspect`, `motion_blender_rig_humanoid` | Inspect and rig a saved Blender model |
| `motion_blender_animate`, `motion_blender_export_fbx` | Create an action and export a clip |

See the [authoring workflow guide](authoring-workflow.md) for the seven workflow tools, image limits, review rules and evidence limitations.

## Studio commands

Select a Model in Workspace before calling `motion_studio_sessions`. The result includes the session and selected model IDs needed by later commands. When multiple Studio sessions are connected, specify the session explicitly.

Scene operations return a job ID. Call `motion_studio_job` to check its status:

- `queued`: waiting for the plugin
- `running`: delivered to Studio
- `succeeded` or `failed`: confirmed by the plugin
- `expired`: never delivered within the allowed time
- `unknown`: delivered, but no result arrived in time
- `cancelled`: an inspection was cancelled before its command was delivered

Inspect the scene before retrying an unknown result. Commands are delivered only once and target the model ID captured during inspection. Changing the selection does not redirect them.

Rigid-part connections preserve rest positions and anchoring. Check anchors before using the rig in gameplay. Duplicate animated names and joint cycles are rejected. Rigs that combine Bone and Motor6D animation need a separately selected sub-rig in this version.

## Animation recipes

### Inspection and feedback

`motion_review_start` takes `assetId`, optional `sessionId` and `rigId` together, `motionMode` (`unknown`, `in_place`, `root_motion`, or `stationary`), and `preview` (default true). It starts a background inspection and returns a review ID. It makes no provider API call. Without a live rig, it reports recipe-only evidence.

Poll `motion_review_read` with `reviewId` until inspection finishes. The compact response includes measured findings, limitations, feedback questions, and the current review revision. Set `includeSamples: true` for actual sampled joint positions. Ask the user the questions and wait for their answers.

Use `motion_review_feedback` with `reviewId`, the current `revision`, and `feedback`: `overall` (`accept`, `refine`, or `redo`), `watchedPreview: true`, `liked`, `changes`, and `answers` containing `questionId` and `answer`. Only record feedback the user actually supplied. Acceptance requires no outstanding change request; refinement requires a description of what to change. Stale revisions are rejected. MCP feedback is labeled as reported by the client; the server cannot verify that a chat client asked its user.

For a revised MCP-authored recipe, call `motion_library_save` with the reviewed asset's `parentId`, then inspect the new ID. The local browser panel also offers provider-powered generation directly from a saved feedback record. See [the review guide](animation-review.md) for evidence limits and storage.

### Format

Each track has a joint name and at least two keys spanning zero through the animation's duration. A key contains:

- `time`: seconds
- `position`: local XYZ offset
- `rotation`: local XYZ Euler angles in degrees

Interpolation is linear. A looping clip must end at its starting pose. Markers such as `Release` are preserved. See [custom-idle.json](../examples/custom-idle.json) for a complete recipe.

Use `jointMap` when recipe names differ from a rig's names. Motor6D animation targets use **Part1 names**, not the names of the Motor6D instances. Bone animation targets use bone names. Mapping names does not retarget local axes or rest poses.

Studio saves use the rig's `AnimSaves` reference and a folder in ServerStorage, or an existing legacy AnimSaves folder. This follows Roblox's [local animation save model](https://create.roblox.com/docs/animation/editor). Loading these generated clips in the native editor still needs verification.

## Blender

The worker reads a saved `.blend` file in a separate Blender process. It does not see unsaved changes in an open window. Each authoring operation writes a new `.blend` and returns `blendFile`. Use that path for the next operation. Outputs and logs are stored in `artifacts/blender/`.

Humanoid fitting assumes a Z-up T-pose and uses the mesh's bounding box to place a rough guide. Supply world-space landmarks to improve the fit. A-pose characters, creatures, clothing, and unusual proportions need more work. Inspect shoulders, elbows, hips, and knees even when the numeric weight checks pass.

Use `bind: false` to create just the armature. Automatic binding keeps the four strongest deform influences per vertex and normalizes them. FBX export rejects unweighted vertices or invalid influence counts. Familiar Roblox bone names do not by themselves make a model a valid R15 avatar or Marketplace asset.

Direct animation rejects active constraints on targeted bones. Bake or disable them in a copy first. Existing NLA tracks are muted in the output so they do not override the new action. Export includes the armature, bound meshes, and one active animation clip. Check scale and motion in Roblox's importer.

### Portable Blender

An optional helper downloads Blender 4.5.0 into the project and checks its official SHA-256 checksum:

```powershell
.\scripts\bootstrap-blender.ps1
$env:BLENDER_EXECUTABLE = (Resolve-Path '.local\tools\blender-4.5.0-windows-x64\blender.exe').Path
npm.cmd run setup
```

This does not replace your system installation. Reinstall the paired Studio plugin if you change connection settings after setup.

## VFX

Effects use native ParticleEmitters. Custom textures must be Roblox asset IDs you can access. The starter texture requires no upload. Saved emitters start disabled; their `EmitCount` attribute stores the burst count. See [custom-spark.json](../examples/custom-spark.json) for an example.

A VFX recipe can instead include `"column": { "length": 18, "travelTime": 0.35, "fadeTime": 0.25, "origin": "hands" }`. This creates a growing 3D cylinder with a rounded leading edge, arrival flash, and fade. `size` is its diameter and `lifetime` includes travel, hold, and fade. Lifetime must exceed travelTime plus fadeTime. Origin defaults to `attachment`; `hands` requires R15 LeftHand, RightHand, and HumanoidRootPart and follows the hand midpoint along the root's forward direction. Column and beam modes are mutually exclusive. Saved columns contain a `MotionColumnRecipe` attribute for replay; they do not install gameplay scripts or damage logic.

## Experimental review capture

`motion_studio_capture_frame` takes rigId, assetId, jointMap, time (0-10 seconds), and view (`front` or `side`). It replaces the current preview, freezes the animation, moves the clone to an elevated stage, temporarily controls the camera, and requests a UI-free 960x540 PNG. Native screenshot permission is required. It restores its camera and removes its clone after the capture attempt.

Retrieve the returned captureId with `motion_studio_capture_chunk`, supplying zero-based index. Each result contains at most 32768 bytes encoded as hex, below the existing bridge message limit. A local client should decode chunks into a PNG rather than feed hex to a model. The latest capture replaces the previous one and expires after 180 seconds; maximum file size is 2 MB. This bounded chunk transport is the pilot alternative to adding a new binary HTTP route. No image is sent to an AI provider automatically. Runtime availability, camera restoration, image framing, and PNG decoding remain pilot checks.

For a continuous laser, add `"beam": { "length": 15 }` to a VFX recipe. This replaces the emitter with a colored Beam and a pale core, pointing along the parent part's local -Z axis. `offset` positions the start, `size` controls width, and `lifetime` controls preview duration. Length is limited to 100 studs. Particle-only settings are ignored in this mode. Saved beams start disabled; their parent attachment has a `Duration` attribute. Enable both Beam children for that duration when triggering them in gameplay. No collision or damage is added.

Preview cues fire once at the requested times. Continuous emitters run until cleanup. Looping the animation does not repeat the cues. The tool does not add gameplay scripts to trigger saved effects.

Animation preview evaluates joints directly on an anchored clone. Confirm final runtime behavior in the game after publishing.

## Studio test checklist

These checks remain to be run in the native application:

- Connect the plugin and inspect a selected R15 rig.
- Preview idle and cast recipes. Confirm the original rig stays unchanged.
- Preview VFX on a hand. Stop the preview and confirm its clone and effects disappear.
- Save a sequence and load it through the Animation Editor's animation list.
- Save a VFX attachment, then use Undo. Confirm only that operation is undone.
- Disconnect Studio before a queued command is delivered. Confirm it expires without running later.
