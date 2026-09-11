# Verification

Last checked: September 11, 2026 for v1.0.0.

## Current automated checks

- TypeScript strict build and 36 Node tests pass. Coverage includes recipe validation, immutable assets, MCP discovery, queue acknowledgements, local API authentication, provider adapters with mock responses, Windows DPAPI key storage, library pagination, inspection metrics, evidence validation, feedback persistence, concurrent writes, cancellation, and feedback-driven revisions.
- Luau fixtures pass for accessory following, energy-column travel/hold/fade, the animation dropdown with 101 clips, shared joint evaluation, estimated ground bounds, source preservation, and inspection cleanup.
- The packaged plugin compiles with official Luau 0.737.
- The local browser walkthrough with simulated Studio and provider responses covers generation, inspection, questions, feedback, a child revision, previous-version preview, explicit acceptance, and reload. No console warnings or errors were observed.

Run `npm.cmd test` for the Node checks. With Luau installed, run `node scripts/test-studio.mjs`; set `LUAU_EXECUTABLE` if needed. Test fixtures do not measure artistic quality or establish native Roblox engine behavior.

## Previously exercised

An earlier portable Blender 4.5.0 smoke test created a synthetic mesh, fitted a 16-bone armature, bound normalized weights with at most four deform influences, created an action, checked evaluated deformation, and re-imported the FBX. The input file stayed byte-identical. The Blender implementation was not changed for v1.

Earlier Studio checks inspected an R15 avatar using AnimationConstraints and received acknowledgements for previews and animation/VFX saves. The animation-library update was also exercised with a saved backflip preview before the v1 inspector was added.

## Still requires live validation

- The new v1 pose sampler on a real Studio rig. Studio disconnected during release testing, and this release proceeded with automated checks.
- Generation and image critique with real paid provider accounts. Request formats, validation, and failures were tested with mocks.
- Visual quality, native Animation Editor loading, undo behavior, physics, cloth, and mesh deformation in a game.
- Automatic viewport screenshots. The tested native capture API returned `Feature not supported yet.` Manual screenshots are supported instead.

The six rendered evaluation cases remain a plan, not a completed quality benchmark. See [review implementation status](review-implementation-status.md).

Generated data, credentials, and test artifacts stay in ignored `.local/` and `artifacts/`. Portable Blender and Luau are project-local test dependencies.
