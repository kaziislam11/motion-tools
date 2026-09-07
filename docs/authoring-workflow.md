# Authoring workflow

The workflow keeps creative intent attached to the work. It runs locally and uses the AI already connected to the MCP server. It neither includes a hosted model nor calls another provider.

## Start and resume

Reload the Motion Tools MCP connection after building the updated server. The Studio plugin does not need reinstalling for this change. Ask the client:

> Start a Motion Tools workflow for this request. Keep my exact wording, record my references and what each should guide, and separate requirements from things to avoid. Inspect the references before creating a rough candidate. Review that candidate before detailing it.

Use `motion_workflow_start` with a `brief`. Its fields are `name`, `kind` (`model`, `animation` or `vfx`), `request`, `approach`, `requirements`, `avoid`, and `references`. Requirements have a unique `id` and `description`. References have an absolute local `path` and `useFor` annotation. Use an empty reference list when no reference exists; do not invent one.

Use separate workflows for the model, animation and effect, with the same shared art direction where appropriate. `motion_workflow_list` finds sessions after a restart. `motion_workflow_read` returns the brief, history, current revision and next stage. Pass that revision to every mutation. If a stale write fails, read the workflow again before making another decision.

## Attach the work and inspect it

Author through the existing tools and preserve each output under its own filename. Call `motion_workflow_attach_candidate` with `workflowId`, `revision`, `artifactPath`, `changes`, and `evidence`. Each evidence item has an absolute `path`, `view`, `description`, and optional `time` in seconds.

- Models need at least two distinct views at each stage. Show bent poses as well as rest views during rigging review.
- Animation needs distinct explicit sample times at each stage. Include contacts and transition boundaries; still frames do not establish smooth playback on their own.
- VFX shape needs two views. Timing and integration need distinct explicit sample times.

Attach 2-12 distinct PNG or JPEG images, each no larger than 2 MB. The artifact can be at most 128 MB. These limits bound transport and local memory; they are not a game asset budget.

Call `motion_workflow_read_evidence` for each returned `evidenceId` to inspect it. To inspect a reference image, use its zero-based `referenceIndex` instead. Supply exactly one selector. Reference image delivery has the same 2 MB limit. Other reference file formats remain paths for the client's appropriate reading tools.

Image bytes are returned to the connected MCP client. Its model provider may process those bytes under that client's settings. No separate provider request is made by Motion Tools.

## Review and revise

Call `motion_workflow_review` with the latest `candidateId`, current revision, and a review. Mark the reviewer `ai` for model judgments. Use `user` only to faithfully record feedback the user actually supplied.

Review every requirement once as `pass`, `fail`, `unknown`, or `not_applicable`. Each finding includes its reason and candidate evidence IDs. Failures need a concrete correction. An early-stage requirement can be not applicable with a reason, but final review must assess all requirements. Review every avoid item by its zero-based index as pass, fail or unknown, with evidence and a reason.

Do not mark timing as passing from a single flattering frame. Do not mark skin deformation as passing from a bone count. If the evidence is insufficient, use unknown and collect better evidence. A passed review advances one stage; any failure or unknown keeps the stage active. The final `reviewed` state describes the record, not a quality certification.

After three candidates in one stage, stop cosmetic retries and reconsider the approach. `motion_workflow_revise_brief` records revised instructions or construction choices and restarts the stages while preserving history. Do not use it to conceal failed attempts. Reference edits also require a new brief revision. A changed artifact or preview requires a new candidate under the appropriate brief revision.

## Current limits

The tool checks file fingerprints, review coverage, evidence references, revision conflicts and stage transitions. It cannot verify that screenshots depict the attached artifact, that view labels or times are truthful, or that the connected model judged the images well. Those are evaluation targets, not implemented guarantees.

It does not capture Studio automatically, generate meshes, fix keyframes, simulate cloth, enforce actions in a separate Blender MCP, or prevent use of low-level tools. Model, motion and VFX quality improvements still need actual before/after comparisons with the user.
