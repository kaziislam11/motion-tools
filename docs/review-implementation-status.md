# Review implementation status

Updated September 11, 2026 for v1.0.0.

## Shipped in v1

- A local authoring panel with Claude, DeepSeek, and GLM API connections, editable model IDs, usage reporting, and bounded generation and repair.
- Studio pose sampling through the shared preview joint evaluator, with front and side diagrams and measured motion findings.
- Optional AI critique of pose data or manually attached screenshots, with evidence ID validation and follow-up questions.
- Explicit keep, refine, and redo feedback. Revisions retain the original brief and the user's keep/change notes, create immutable child recipes, and receive fresh inspections.
- Persistent feedback tied to recipe fingerprints, stale-write protection, revision reservations, cancellation, and restart recovery.
- A Studio dropdown for every saved animation recipe, including earlier versions.
- Three MCP review tools, bringing the total to 30. The earlier reference workflow for models, animation, and VFX remains available.

## Verification

Node tests cover provider request formats with mocks, local authentication, key storage, generation validation, bounded repair, cancellation, pagination, feedback persistence, stale and concurrent writes, screenshot hashes, evidence citations, and the complete draft-to-revision loop.

Luau fixtures cover accessory following, energy-column timing, animation dropdown behavior with 101 clips, shared pose evaluation, rest-ground bounds, source preservation, and cleanup on errors. A browser check using simulated Studio and provider responses completed generation, inspection, feedback, revision, parent replay, acceptance, and reload without console errors. These fixtures do not establish real model output quality or native engine behavior.

The new v1 pose sampler has not completed a live Studio check. Studio disconnected during release testing; the release proceeded with automated checks. Earlier versions exercised R15 preview and animation/VFX save acknowledgements. Real paid provider calls, native Animation Editor loading, and visual quality remain unverified for this release.

## Remaining limits

The native viewport screenshot attempt returned `Feature not supported yet.` in the tested Studio runtime. v1 avoids that dependency for pose inspection and allows manual screenshot attachment. It does not claim automatic rendered inspection, physics checks, or cloth/mesh evaluation.

The six rendered evaluation cases in [the evaluation plan](review-evaluation.md) are still specifications, not completed benchmark fixtures. No accuracy, artistic-quality, or time-saving benchmark is claimed from them. Native rough-clip import, constrained keyframe patches, and automatic rendered before/after comparisons remain future work. Revisions currently generate and validate a complete child recipe from the user's feedback.
