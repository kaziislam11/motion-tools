# Roblox Motion Tools

Rigging, animation, and VFX tools for Roblox that you can use through an MCP-compatible chat client.

Making a model is only part of getting a character into a game. It still needs a skeleton, animations, and effects that line up with the motion. This project connects Blender and Roblox Studio so those jobs can be done from the same conversation.

The project has three parts: a local MCP server, a small Studio plugin, and a Blender worker. Use it with a client such as Codex or Cursor. There is no separate chat app or hosted service to sign up for.

## What it does

| Area | Included so far |
| --- | --- |
| Rigging | Inspect bones and Roblox joints, connect rigid parts with Motor6Ds, fit a basic humanoid skeleton in Blender, and bind skin weights |
| Animation | Start with idle, walk, cast, or slash motions, edit individual joint keyframes, and save new versions |
| VFX | Build particle effects with editable color, size, lifetime, speed, spread, and emission |
| Preview | Preview an animation with timed effects on a temporary copy of a Studio rig |
| Export | Save Roblox KeyframeSequences or export a Blender rig and its active animation to FBX |

**Status: early development.** The Blender workflow has passed an automated test covering rigging, skin weights, mesh deformation, and FBX export/import. Studio inspection, preview dispatch, and animation/VFX saves have been exercised on an R15 avatar with AnimationConstraints. Visual quality, undo, and loading clips in the Animation Editor still need testing.

## Getting started

The setup scripts target Windows. You will need:

- Node.js 22 or newer
- Roblox Studio
- An MCP-compatible chat client
- Blender if you want to use the mesh rigging and FBX tools

Clone the repo and install the dependencies:

```powershell
git clone https://github.com/kaziislam11/roblox-motion-tools.git
cd roblox-motion-tools
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

Setup creates the plugin and connection files in `.local/`. It does not edit your chat client's settings. Add the generated server configuration to your client:

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

To watch again, click **Replay last preview** in Motion Tools. Each click restarts the animation and its timed effects on a fresh temporary copy. **Stop preview** removes the copy. The last preview is remembered until you close the experience; after reopening, ask the chat to preview your saved recipe once.

R15 previews support Motor6D and AnimationConstraint joints. Rigid accessories follow welds, rigid constraints, or a uniquely matching avatar attachment. This carries accessories with the body; it does not simulate cape cloth or hair physics.

Blender works on saved `.blend` files. Save your work first, including anything made through another Blender MCP. Each operation writes a new file and returns its path for the next step. The original file is preserved.

## Current limits

- Humanoid rig fitting assumes a Z-up character in a T-pose. It is a starting skeleton, not a general-purpose auto-rigger. Joint placement and skinning need a visual check.
- The animation presets are simple starting motions. They need refinement for a finished game.
- Joint name mapping does not fix differences in bone axes or rest poses. Blender bones with active constraints need those controls baked or disabled in a copy first.
- VFX supports ParticleEmitters and straight lasers made with native Beams. Trails and mesh effects are not implemented yet.
- Preview effects fire once at their assigned times. They do not repeat when the animation loops.
- Publishing animations and adding gameplay code are separate steps. This tool does not upload assets or create combat scripts.

See the [tool reference](docs/tool-reference.md) for all 18 MCP tools, recipe details, and the Studio test checklist. There are also [example recipes](examples/) you can use as a starting point.

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

With Luau installed, run `node scripts/test-studio.mjs` for accessory binding regression checks. Set `LUAU_EXECUTABLE` if your Luau executable is elsewhere.

```text
src/       MCP server, recipes, asset library, and application connections
studio/    Rig inspection, animation, VFX, preview, and plugin panel
blender/   Blender operations and native verification
scripts/   Build, setup, installation, and test helpers
tests/     Core and MCP integration tests
examples/  Animation and VFX recipes
```

If something breaks, open an issue with the operation you tried, your Blender or Studio version, and the error message. A small test rig or recipe helps. Leave pairing tokens and private assets out of the report.
