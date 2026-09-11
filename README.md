# Roblox Motion Tools

Rigging, animation, and VFX tools for Roblox. Bring your own Claude, DeepSeek, or GLM API key, or use an MCP client.

Making a model is only part of getting a character into a game. It still needs a skeleton, animations, and effects that line up with the motion. This project connects Blender and Roblox Studio so those jobs can be done from the same conversation.

The project includes a local server, a Studio plugin, a browser authoring panel, and a Blender worker. The panel can generate animation and VFX drafts without Codex or Cursor. MCP clients can also use the full tool set, including Blender rigging. There is no Motion Tools account or hosted backend.

## What it does

| Area | Included so far |
| --- | --- |
| Rigging | Inspect bones and Roblox joints, connect rigid parts with Motor6Ds, fit a basic humanoid skeleton in Blender, and bind skin weights |
| Animation | Start with idle, walk, cast, or slash motions, edit individual joint keyframes, and save new versions |
| VFX | Build particle effects with editable color, size, lifetime, speed, spread, and emission |
| Preview | Preview an animation with timed effects on a temporary copy of a Studio rig |
| Export | Save Roblox KeyframeSequences or export a Blender rig and its active animation to FBX |
| Authoring workflow | Keep model, animation and VFX briefs, annotated references, preview evidence, reviews and revision history together |
| AI connections | Choose Claude, DeepSeek, or GLM, set a model, and generate or revise drafts using your own API key |
| Animation library | Browse every saved animation revision in Studio, select a clip, and replay it on the selected rig |
| Review and refinement | Sample the animation on the Studio rig, inspect motion, answer follow-up questions, and make a new version from saved feedback |

**v1.0.0** adds the generate, inspect, ask, and revise loop. It is an authoring tool for editable drafts. A valid recipe or a clean inspection does not guarantee a good animation; your judgment drives the next revision. See the [release notes](docs/release-notes-v1.0.0.md) and [verification limits](docs/review-implementation-status.md).

## Getting started

The setup scripts target Windows. You will need:

- Node.js 22 or newer
- Roblox Studio
- A provider API key for the local authoring panel, or an MCP-compatible chat client
- Blender if you want to use the mesh rigging and FBX tools

Clone the repo and install the dependencies:

```powershell
git clone https://github.com/kaziislam11/motion-tools.git
cd motion-tools
npm.cmd ci --ignore-scripts
```

If Blender is not on your PATH, set its location before running setup:

```powershell
$env:BLENDER_EXECUTABLE = 'C:\path\to\blender.exe'
```

Build the server and install the Studio plugin:

```powershell
npm.cmd run setup
.\scripts\install-studio-plugin.ps1
```

Setup creates the plugin and connection files in `.local/`. It preserves an existing Blender executable setting and does not edit your chat client's settings.

### Use your own AI provider

```powershell
npm.cmd run app
```

This opens a local browser panel. Choose **Claude**, **DeepSeek**, or **GLM (Z.ai)**, follow **Get an API key**, then enter the key and click **Save connection**. You can change the model ID before generating. Keys stay in server memory by default. On Windows, **Remember with Windows encryption** stores a DPAPI-protected key in the ignored `.local/` directory. Environment variables are also supported: `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`, and `ZAI_API_KEY`.

Open Studio, select a rig, and connect the Motion Tools plugin. In the browser, choose that rig under **Target rig**, write the motion or effect you want, and click **Generate draft**. With inspection enabled, the harness samples the animation, starts its Studio preview, and opens **Watch, judge, refine**. Use **Preview selected** to replay it and **Save to Studio** to create the editable native asset.

API use is billed by the selected provider. There is no shared Motion Tools AI account or consumer chat login. Saving a connection makes no API call. Each draft uses one generation call. **Ask my AI to review the pose data** is checked by default and adds one critique call when Studio samples are available. Uncheck it for measured inspection and feedback questions without that extra call. An optional repair permits one more call when recipe validation fails. See [provider setup and limits](docs/provider-connections.md).

If the app starts the server, keep its terminal open. If an updated MCP server is already running, the app reuses it. After updating Motion Tools, restart an older server before opening the panel. Only one server can own the Studio bridge port.

### Use an MCP client

Add the generated server configuration to your client:

| File | Use |
| --- | --- |
| `.local/mcp-config.json` | Clients with a JSON `mcpServers` configuration, including Cursor |
| `.local/codex-config.toml` | Codex MCP configuration |

Reload your chat client, then restart Studio. Open **Plugins > Motion Tools**, select a rig in Workspace, and click **Connect**. Allow the plugin to communicate with `127.0.0.1` if Studio asks. Keep Studio in edit mode.

Let your MCP client start the server. Running `npm start` at the same time will cause a port conflict. Use one client connection at a time.

The files in `.local/` contain your pairing token and machine-specific paths. Keep them local. The plugin installer backs up an existing copy before replacing it.

## Try it

Once connected, ask your client to:

> Inspect my selected rig. Make a two-second casting animation and preview it with a fire charge on the right hand.

Or refine something you already made:

> Shorten the windup, keep the release at the same point, and save a new version so I can compare them.

For Blender:

> Inspect this saved .blend file. Fit a humanoid rig to the Body mesh and check the skin weights.

The client interprets the request and calls the tools. Animation and effect recipes stay editable, and each saved revision gets its own file. Studio commands return a job ID so the client can check whether the operation actually finished.

## Watch, judge, refine

The v1 harness works on existing library clips as well as new drafts:

1. Select the animation and a live rig, then click **Inspect & ask me**. Choose whether the motion is in place, contains travel, or should stay planted.
2. Watch the Studio preview. The panel shows front and side joint diagrams and measured findings about body movement, foot clearance, and loop transitions. Time links jump to the relevant samples.
3. Answer the follow-up questions. Choose **Keep this version**, **Refine it**, or **Try a different approach**, then describe what should stay and what should change.
4. Click **Save my feedback**. For a revision, click **Make the requested changes**. The next generation receives the original brief, parent recipe, inspection findings, and your keep/change notes. It gets a new library entry and its own inspection.

**Preview previous version** lets you compare the parent. Reviews and feedback survive restarts and belong to the exact recipe that was inspected. The AI cannot accept a version through the critique response.

Pose sampling runs inside Studio using the same joint evaluator as preview. It does not depend on Studio's experimental screenshot API. The diagrams are joint positions, not character renders. To review clothing, silhouette, or an effect's appearance, attach screenshots of that version and click **Ask AI to inspect this evidence** with an image-capable model. VFX has recipe checks and screenshot review; it does not have a simulated motion inspection.

MCP clients can use `motion_review_start`, `motion_review_read`, and `motion_review_feedback` to run the same measured inspection and ask you for feedback in chat. See the [review guide](docs/animation-review.md).

To browse old clips in Studio, click **View animations**, pick a clip, and click **Play selected animation**. The dropdown reads the persistent recipe library, including old revisions and clips created through an MCP client. Duplicate names have date and ID labels. **Refresh animation library** picks up new assets, and the duration field controls playback for up to 30 seconds. The currently selected rig receives the preview.

**Replay last preview** also remains available for replaying an animation together with its timed effects. **Stop preview** removes the temporary copy. The last combined preview is remembered for the current Studio session; the animation library persists across restarts. Clips created only in Roblox's Animation Editor are not imported into this recipe library automatically.

R15 previews support Motor6D and AnimationConstraint joints. Rigid accessories follow welds, rigid constraints, or a uniquely matching avatar attachment. This carries accessories with the body; it does not simulate cape cloth or hair physics.

Blender works on saved `.blend` files. Save your work first, including anything made through another Blender MCP. Each operation writes a new file and returns its path for the next step. The original file is preserved.

## Current limits

- Humanoid rig fitting assumes a Z-up character in a T-pose. It is a starting skeleton, not a general-purpose auto-rigger. Joint placement and skinning need a visual check.
- The animation presets are simple starting motions. They need refinement for a finished game.
- Joint name mapping does not fix differences in bone axes or rest poses. Blender bones with active constraints need those controls baked or disabled in a copy first.
- VFX supports ParticleEmitters, flat native Beams, and growing 3D energy columns with arrival and fade phases. Column playback is currently a Motion Tools preview feature; saved column definitions need a runtime integration for gameplay.
- Preview effects fire once at their assigned times. They do not repeat when the animation loops.
- Publishing animations and adding gameplay code are separate steps. This tool does not upload assets or create combat scripts.

See the [tool reference](docs/tool-reference.md) for all 30 MCP tools, recipe details, and the Studio test checklist. There are also [example recipes](examples/) you can use as a starting point.

## Work from references

For a substantial modeling, animation or VFX request, ask the client to start a Motion Tools workflow. The brief keeps your original request, annotated local references, requirements and things to avoid. The client receives a stage plan and specific review guidance:

- Models: silhouette, surfaces, rigging.
- Animation: key poses, timing, polish.
- VFX: shape, timing, integration.

The client still creates the asset using the existing tools. It then attaches the candidate file and at least two preview images. Motion Tools can return these images to compatible MCP clients for inspection. Reviews must cover every requirement and exclusion and cite that candidate's evidence. Failed or uncertain findings keep the same stage open. Three attempts require a revised approach.

Files are fingerprinted so changed previews cannot silently inherit an earlier review. Briefs and review history persist across restarts in the ignored `artifacts/workflows/` directory. Preserve candidate files under distinct names; the workflow stores their paths and hashes, not backup copies.

This is an authoring workflow, not an autonomous art critic. The connected AI supplies the judgment, and a recorded review does not certify quality. Other MCP servers and existing low-level tools can bypass the workflow. Studio capture is still experimental, so exported images can be attached manually. See [the workflow guide](docs/authoring-workflow.md).

Automatic viewport screenshots remain experimental: the tested Studio installation returned `Feature not supported yet.` The v1 pose inspector and manually attached images work around that dependency. The earlier rendered evaluation pilot is still incomplete; see [implementation status](docs/review-implementation-status.md) and [the evaluation plan](docs/review-evaluation.md).

## Development

Run the build and tests:

```powershell
npm.cmd test
```

To run the Blender smoke test, set `BLENDER_EXECUTABLE` to your Blender executable, then run:

```powershell
npm.cmd run test:blender
```

The test creates its own mesh, rigs and animates it, checks that the vertices move, and re-imports the exported FBX. Results go in `.local/blender-test/`.

Optional scripts in `scripts/` download checksum-verified copies of Blender 4.5.0 and Luau 0.737 into the project. See [verification](docs/verification.md) for the checks run so far.

With Luau installed, run `node scripts/test-studio.mjs` for accessory bindings, energy-column playback, animation-dropdown checks, and pose-inspection fixtures. Set `LUAU_EXECUTABLE` if your Luau executable is elsewhere.

```text
src/       MCP server, recipes, asset library, and application connections
studio/    Rig inspection, animation, VFX, preview, and plugin panel
web/       Local provider connections, draft authoring, and asset browser
blender/   Blender operations and native verification
scripts/   Build, setup, installation, and test helpers
tests/     Core and MCP integration tests
examples/  Animation and VFX recipes
```

If something breaks, open an issue with the operation you tried, your Blender or Studio version, and the error message. A small test rig or recipe helps. Leave pairing tokens and private assets out of the report.
