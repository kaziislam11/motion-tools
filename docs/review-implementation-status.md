# Review pilot implementation status

Updated 2026-09-07.

## Completed work

- Added a shared authoring workflow for models, animation and VFX: persistent briefs, reference fingerprints, staged candidates, image delivery, recorded reviews, immutable revision history and a three-attempt stage limit. The connected client supplies review judgments. This is separate from an autonomous reviewer or the uncompleted evaluation pilot. See [the workflow guide](authoring-workflow.md).

- Added growing 3D energy column preview support: cylinder core, translucent outer layer, rounded leading edge, muzzle, arrival flash, hold, and fade.
- Added a hand-midpoint origin option and prepared KamehamehaColumnHold with a longer firing pose.
- Confirmed Studio acknowledged preview start and saving of the animation and column definition. Visual quality still needs user review.
- Added bounded front/side pose capture and local PNG chunk retrieval tools. Capture temporarily isolates and freezes a preview clone and restores its owned camera state.
- Added six evaluation case specifications and documented the pilot's detection and revision gates. These specifications are not six completed rendered fixtures.
- Nine Node tests, accessory regression checks, column timing checks, and plugin compilation pass.

## Actual blocker

The installed Studio runtime returned `Feature not supported yet.` for the first native capture attempt. No frame or image bytes were obtained. Automatic capture is not validated. The documented fallback is manual front/side preview-only exports, after which image and telemetry comparisons can be evaluated.

## Remaining work

- Construct and render the six evaluation fixtures.
- Obtain synchronized front and side evidence and measured rig transforms.
- Evaluate review usefulness before implementing automatic revisions.
- Implement validated review contracts, telemetry metrics, provider review, constrained patches, and before/after UI after the pilot gates permit them.
- Native rough-clip import and text-to-motion planning remain later milestones.

The full animation-review plan is not complete. No AI critique or automatic refinement is enabled, and no user images have been sent to a provider by these new tools.
