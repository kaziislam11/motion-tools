# Animation review pilot

Status: evaluation specification only. No captures, model reviews, timings, costs, or quality improvements have been measured.

The pilot compares telemetry-only critique with telemetry plus matched front/side images. It uses three synthetic base clips, each with a control and one deliberately flawed counterpart. Case descriptions are in `tests/review/fixtures/cases.json`; these are fixture specifications, not executable animation recipes or completed captures.

## Fixture preparation

Use one basic R15 rig with recorded rest transforms, hierarchy, scale, and explicit foot contact points. Sword guard also requires a simple reference sword with two grip targets. A back-mounted accessory is not a grip target. Build controls that satisfy their declared contacts before injecting a defect. Verify the intended defect by evaluated world transforms, then confirm it is observable in the designated evidence.

The idle defect is a near-boundary pose snap with matching endpoint keys. This preserves the existing recipe schema's loop closure rule while testing perceptual continuity. The run defect is displacement during an explicitly planted interval. The guard defect separates one hand from an explicit grip target. Do not label artistic differences as defects.

## Evidence collection

Follow [capture feasibility](review-capture-feasibility.md). Sample transforms at 30 Hz, with clips limited to 10 seconds. Select no more than 12 image times per view, including each case's suggested samples. Use 960 by 540 front and side frames with matching projection and framing across control and flawed variants. Each image must be at most 2 MB, and the complete set at most 24 MB.

Store actual recipes, rig fingerprints, camera records, frames, telemetry, and run manifests under ignored `artifacts/review-pilot/`. Record animation time and wall-clock time separately. No user avatar or captured asset belongs in committed fixtures.

## Review protocol

Run the same provider/model, motion brief, rubric, and deterministic measurements twice per case: once with telemetry, once with telemetry and images. Use randomized neutral case identifiers and withhold injected-defect labels from the model. Do not let one arm of the comparison see the other's output. Require findings to cite evidence and distinguish uncertain stylistic suggestions from demonstrated constraint violations.

For every run record detected intended defects, unsupported high-severity findings, proposed correction, latency, model identifier, input/output and image usage, and provider-reported cost when available. Missing cost stays unavailable. Have the user assess whether corrections address the intended defect; do not let the reviewer grade itself.

## Gates

The combined reviewer must detect at least two of the three injected defects, produce no more than one unsupported high-severity finding across controls, and suggest a concrete correction for every detected defect. Until measured, this gate is pending.

Only after that gate may the constrained revision system proceed. Its separate gate requires at least two flawed clips to improve in blinded user comparison without regressing declared contacts or protected poses. No unattended iteration is included.

## Pending results

| Check | Status |
| --- | --- |
| Six case specifications | Written |
| Executable clip and rig fixtures | Not built |
| Capture API documentation | Located |
| Edit-mode capture and PNG export | Not tested |
| Repeated front/side capture consistency | Not tested |
| Telemetry versus image comparison | Not run |
| Reviewer gate | Pending |
| Revision gate | Pending |
