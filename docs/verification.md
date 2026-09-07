# Verification

Last checked: 2026-09-06.

## Verified automatically

- TypeScript strict build.
- Seven Node tests covering loop closure and timing; invalid recipe rejection; immutable revisions and path traversal rejection; session isolation; at-most-once delivery; queued command expiration; unknown outcomes; authenticated HTTP; and actual MCP client/server stdio tool discovery, authoring, readback, revisions and offline errors.
- Generated plugin compiles with official Luau 0.737.
- Actual portable Blender 4.5.0 test: a synthetic unrigged mesh receives a 16-bone armature and automatic weights; all vertices are weighted, normalized and limited to four deform influences; an action is created; evaluated vertices move during animation; FBX re-import retains the mesh, 16 bones and animation; the input .blend is byte-identical afterward.
- Setup generates a paired plugin and absolute-path JSON/TOML MCP configurations.

## Still requires native Studio validation

The plugin has not yet been exercised inside Roblox Studio. HTTP simulation and Luau compilation are not substitutes for those checks. Follow the README checklist for preview positioning, particle rendering, Animation Editor loading, undo behavior and disconnection handling.

## Practical limitations

This first implementation is an MCP authoring backend, a small Studio connection panel and a Blender worker. It does not yet include a standalone visual editor or embedded AI chat. Starter animations need artistic refinement. Humanoid guide fitting and valid numeric weights do not guarantee good deformation on an arbitrary model. Name mapping does not retarget local bone axes. Native VFX currently covers particle emitters; beams, trails and custom mesh effects are future work.

Generated and test data is in ignored `.local/` and `artifacts/`. Portable Blender and Luau are project-local test dependencies, not system installation replacements.
