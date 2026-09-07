# Reference-driven authoring harness

Status: shared workflow implemented. Artistic improvement has not been measured.

## Problem

Motion Tools validates recipes and dispatches commands. It does not currently preserve an art brief, associate visual evidence with a particular revision, or require a comparison before further work. The recent character models were created through a separate Blender MCP, outside Motion Tools entirely. Successful geometry generation and export said nothing about their appearance.

The user's requests were sufficiently clear to rule out beveled box anatomy. The authoring process failed to follow that direction. Prompt expansion alone would not fix that failure.

## First implementation

Use a shared persistent authoring session for models, animation, and VFX. Each session contains the verbatim request, annotated reference paths, explicit requirements and exclusions, and a bounded stage plan. These are supplied by the connected client, not fabricated by a second hidden model.

Model stages: silhouette, surfaces, rigging. Animation stages: key poses, timing, polish. VFX stages: shape, timing, integration. Completion means these stages have recorded reviews, not that an asset is production ready.

Each candidate names an actual local artifact and one or more local PNG or JPEG previews. Snapshot file hashes so subsequent changes cannot silently inherit an earlier review. Review each requirement at every stage as pass, fail, unknown, or not applicable. A not-applicable finding needs a reason. An AI review is a recommendation, distinct from user feedback and technical verification.

Failures and unknowns keep the same stage active. A replacement must describe its changes and reference the previous candidate. Limit a stage to three attempts per brief revision, then require a revised brief or approach. Preserve old candidates and reviews. Use immutable, numbered snapshots and expected revisions to reject stale writes.

Expose the images through MCP so compatible clients can actually inspect evidence. Do not claim that returning an image proves the model understood it. The next-step response includes the relevant brief, stage guidance, previous findings, and the applicable capability limitations.

## Boundaries

This is a workflow around existing execution tools. It cannot intercept arbitrary calls to another Blender MCP, guarantee artistic judgment, or run an autonomous reviewer. Existing low-level tools remain available. No provider key, hosted AI, paid generation, automatic mesh repair, or Studio screenshot workaround is introduced.

Studio's native screenshot feature is still unavailable in the tested installation. Manually exported preview images can be attached. Blender renders can be attached directly. Animation and VFX evidence should include a timed sequence of frames, not just a beauty render.

## Verification

Exercise stale revisions, file replacement after attachment, incomplete and unsupported reviews, failed-stage retry, attempt limits, brief revision, all three stage plans, restart persistence, and real MCP image delivery. Keep generated assets and reference images out of Git. Artistic improvement remains unmeasured until a user compares actual outputs.
