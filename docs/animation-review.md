# Animation review in v1

The harness keeps a short loop: make a draft, inspect it, watch it, answer questions, and revise. Your feedback decides what changes. A version is accepted only after you choose to keep it.

## First review

1. Run `npm.cmd run app`. Choose a configured provider, connect the updated Studio plugin, select a rig, and choose it under **Target rig**.
2. Generate a draft with **Preview, inspect, and ask me for feedback** checked, or pick an existing library clip and click **Inspect & ask me**.
3. Watch the Studio preview. Use **Preview selected** to replay it. The panel's front and side diagrams help locate measured poses; they do not show the rendered character.
4. Answer the questions and choose **Keep this version**, **Refine it**, or **Try a different approach**. Write what should stay and what should change, confirm that you watched the preview, and save your feedback.
5. For refinement, click **Make the requested changes**. The harness sends your original brief, the reviewed recipe, your answers, keep/change notes, and inspection findings to your chosen provider. It saves a new child version and inspects it again.

Older clips stay in the library. **Preview previous version** replays the parent of the current revision. Selecting an older clip restores its saved review. To reconsider an accepted version, start a new inspection for that version.

## What gets inspected

The Studio plugin evaluates a detached, anchored clone with the same joint evaluator used by animation preview. It samples 49 evenly spaced times plus up to 15 additional marker times, including both endpoints. Inspection supports up to 96 nodes and requires edit mode. It restores the original model's Archivable setting and destroys its clone even when sampling fails.

The report includes body rise/drop and horizontal displacement, estimated foot clearance and near-ground movement, and endpoint position and velocity differences for loops. Ground comes from the rig's rest-pose bounds. It is not a raycast against your map. Foot naming is heuristic, and skinned bone rigs have no measured foot sole thickness.

Choose the intended motion mode before inspecting:

| Mode | Interpretation |
| --- | --- |
| In place | The game supplies travel. Backward foot movement is not automatically a sliding defect. |
| Contains travel | Sampled travel is reported, but the harness cannot infer the game's intended speed. |
| Stationary | Large movement near the estimated ground may indicate an unwanted contact shift. |
| Not sure | Report measurements and uncertainty without assuming planted feet. |

Sampling can miss short events between samples. No flags does not mean a good animation. Inspection does not simulate gameplay, gravity, cloth, hair, mesh deformation, or collisions. Joint positions also cannot describe every change in hand or foot orientation.

## Optional AI critique and screenshots

AI pose review is enabled by default in the panel. When Studio samples are available, it adds one provider call with a 2,500 output token limit. Uncheck it to use the local measurements and standard questions only. You can also click **Ask AI to inspect this evidence** manually.

The critique must cite supplied sample IDs or attached image IDs. Invalid references and malformed responses are rejected without a retry. The critique cannot set the acceptance status.

For a visual critique, attach screenshots of the exact version under review. The browser resizes PNG, JPEG, or WebP files to PNG, at most 960 pixels on the longer side. The server accepts up to four images per review, each at most 1.5 MB and 2048 pixels per side. Images are fingerprinted and checked again before transmission. They go to your selected provider only when you click **Ask AI**. Use an image-capable model; support depends on your account and model ID.

The tool cannot verify that a manually labeled screenshot shows the claimed version, view, or clip time. It does not automatically capture the viewport. The older native capture tool remains experimental and was unsupported in the tested Studio runtime.

VFX uses parameter checks and user questions. An attached screenshot can support a visual critique, but v1 does not sample or simulate particles, beams, or energy columns for analysis.

## Persistence and failures

Reviews are immutable numbered snapshots under `artifacts/reviews/<review-id>/`. They contain the asset fingerprint, samples, findings, questions, screenshots, feedback, and child version link. Generation provenance remains under `artifacts/generations/`. These folders are local and ignored by Git.

Submitting an old review revision is rejected. Editing a recipe file outside the library invalidates its old review. A generation reservation prevents two requests from consuming the same feedback simultaneously. If generation cannot start, feedback remains available to retry. Restarted operations recover to a state requiring feedback or a retry, never acceptance.

Cancel stops an inspection or critique and cancels Studio commands that have not been delivered. It cannot undo a delivered preview or guarantee that a provider stops billing work already performed. Use **Stop** to stop an active Studio preview.

MCP clients use `motion_review_start`, `motion_review_read`, and `motion_review_feedback`. Those tools do not call a paid provider. The client reads the inspection, asks the user for real answers, and makes a child recipe with the existing library tools. Feedback supplied through MCP is labeled `client_reported_user`; the server cannot independently verify the conversation.
