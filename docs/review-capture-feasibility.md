# Studio capture feasibility

Research date: 2026-09-07. Status: documented API found; installed Studio runtime rejected the capture attempt with `Feature not supported yet.` No PNG was returned or exported.

Runtime evidence: the paired plugin acknowledged `capture_frame` job `fee0a0ae-9dac-4c47-99f9-7681764e4753` as failed on 2026-09-07. The API path is not usable in this installation yet. This result does not identify which internal feature flag is unavailable. Use manual preview-only image export for the pilot; do not claim the automatic capture gate passed.

Roblox's official source documentation identifies `StudioCaptureService` as a Studio plugin service for the active place's **3D viewport**. It is a suitable surface boundary for the pilot, provided the preview is isolated from other scene content. `RequestScreenshotPermissionAsync()` requests plugin capture permission; a disabled global screenshot setting causes refusal. `CanCaptureScreenshot()` checks availability, including active-place and permission conditions, but does not guarantee success. [Official service documentation](https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/StudioCaptureService.yaml)

`CaptureScreenshot()` accepts `Position`, `CaptureSize`, `OutputSize`, `ResampleMode`, `Format`, and `UICaptureMode`. Use PNG and explicitly request `UICaptureMode.None`, since UI inclusion defaults to All. Resampling is required when output size differs from captured size. The requested rectangle must fit the source viewport. These are documented options, not yet a tested implementation. [Capture options](https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/StudioCaptureService.yaml)

The result is a `StudioScreenshotCapture`. Wait for `BufferStatus` to become `Ready` or `Error`, with cancellation and a bounded timeout. Only `Ready` allows `GetBuffer()`, which returns actual image bytes. `BufferFormat.PNG` means PNG-encoded bytes; `GetErrors()` reports failures. This is a byte export path, not an inaccessible temporary image identifier. [Official result documentation](https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/StudioScreenshotCapture.yaml)

## Pilot blockers and next checks

- Verify this API exists in the user's installed Studio version and is available in edit mode. Documentation establishes Studio/plugin scope, but does not demonstrate this installation or state.
- Isolate a temporary clone and ground plane in the 3D viewport. The API captures the active view, not a named model. Confirm front and side crops contain only intended preview content before sending any frame to a reviewer.
- With the user granting the native permission prompt, capture one fixed pose twice from each view. Validate PNG decoding, dimensions, pose/camera consistency, and absence of UI. Record observed results rather than treating documentation as a passed test.
- Freeze the sampled pose while the asynchronous capture finishes. Record recipe time separately from wall-clock capture time.
- Export bytes through a separate authenticated, size-limited local upload route, outside the current 512 KB command messages. Save only under the review artifact directory. PNG encoding itself is provided by the API; transport remains implementation work.

If runtime capture or export fails, the pilot uses manually exported preview-only PNG files with a manifest. No whole-desktop capture fallback is permitted. Manual capture still needs matched pose, rig, camera, and time metadata. Automatic capture remains unverified until the repeated-frame test passes.
