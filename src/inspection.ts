import { createHash } from 'node:crypto';
import { z } from 'zod';
import { identifier, label, type AnimationRecipe, type Recipe } from './recipes.js';

const coordinate = z.number().finite().min(-10000).max(10000);
const point = z.tuple([coordinate, coordinate, coordinate]);
export const telemetrySchema = z.object({
  version: z.literal(1), source: z.literal('studio_pose_evaluator'), rigId: identifier, assetId: identifier,
  duration: z.number().min(0.1).max(30), loop: z.boolean(), height: z.number().finite().min(0.1).max(10000),
  groundSource: z.enum(['rest_foot_bounds', 'rest_node_bounds']), note: z.string().max(2000),
  nodes: z.array(z.object({ name: label, parent: z.number().int().min(0).max(96), driven: z.boolean(), foot: z.boolean() }).strict()).min(1).max(96),
  samples: z.array(z.object({ id: z.string().regex(/^s\d{3}$/), time: z.number().finite().min(0).max(30), points: z.array(point).min(1).max(96), bottoms: z.array(coordinate).min(1).max(96) }).strict()).min(2).max(65),
}).strict().superRefine((data, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (new Set(data.nodes.map(n => n.name)).size !== data.nodes.length) issue('Duplicate sampled node names.');
  if (data.nodes.some((n, index) => n.parent > index)) issue('Sampled hierarchy must be in parent-first order.');
  if (new Set(data.samples.map(s => s.id)).size !== data.samples.length) issue('Duplicate sample IDs.');
  if (data.samples[0]!.time !== 0 || data.samples.at(-1)!.time !== data.duration) issue('Sampled timeline does not cover the entire clip.');
  for (const [index, sample] of data.samples.entries()) {
    if (sample.points.length !== data.nodes.length || sample.bottoms.length !== data.nodes.length) issue('Sample node count differs from the declared rig.');
    if (index && sample.time <= data.samples[index - 1]!.time) issue('Sample times must increase.');
  }
});
export type Telemetry = z.infer<typeof telemetrySchema>;
export const motionMode = z.enum(['unknown', 'in_place', 'root_motion', 'stationary']);
export type MotionMode = z.infer<typeof motionMode>;
export type Question = { id: string; question: string; choices?: string[] };
export type Finding = { id: string; severity: 'note' | 'possible_issue' | 'unknown'; title: string; detail: string; sampleIds: string[] };
export type Metric = { id: string; label: string; value: number; unit: string; detail: string; sampleIds: string[] };
export type Inspection = { source: 'studio_pose_evaluator' | 'recipe_only'; metrics: Metric[]; findings: Finding[]; questions: Question[]; limitations: string[] };
export function fingerprint(recipe: Recipe) { return createHash('sha256').update(JSON.stringify(recipe)).digest('hex'); }
export function sampleTimes(recipe: AnimationRecipe) {
  const times = new Set(Array.from({ length: 49 }, (_, index) => index === 48 ? recipe.duration : Number((recipe.duration * index / 48).toFixed(6))));
  for (const marker of recipe.markers.slice(0, 15)) if ([...times].every(time => Math.abs(time - marker.time) > 0.0001)) times.add(marker.time);
  return [...times].sort((a, b) => a - b);
}
const round = (n: number) => Math.round(n * 10000) / 10000;
const distance = (a: number[], b: number[], horizontal = false) => Math.hypot(a[0]! - b[0]!, horizontal ? 0 : a[1]! - b[1]!, a[2]! - b[2]!);
export function inspectMotion(recipe: Recipe, raw?: unknown, mode: MotionMode = 'unknown'): { report: Inspection; telemetry?: Telemetry } {
  const report: Inspection = { source: raw ? 'studio_pose_evaluator' : 'recipe_only', metrics: [], findings: [], questions: [], limitations: [] };
  if (recipe.kind === 'vfx') {
    report.source = 'recipe_only';
    report.findings.push({ id: 'vfx-shape', severity: 'note', title: 'Effect construction', detail: recipe.column ? `3D column with ${recipe.column.travelTime}s travel, ${round(recipe.lifetime - recipe.column.travelTime - recipe.column.fadeTime)}s hold, and ${recipe.column.fadeTime}s fade.` : recipe.beam ? 'Native flat beam. Confirm that this matches the volume you wanted.' : 'Particle emitter. Appearance depends on texture, camera, and lighting.', sampleIds: [] });
    report.questions = [{ id: 'shape', question: 'Does the effect have the volume and silhouette you wanted?', choices: ['Yes', 'Needs more volume', 'Needs a different shape'] }, { id: 'timing', question: 'How should its timing change?', choices: ['Keep it', 'Faster arrival', 'Longer hold', 'Faster fade'] }, { id: 'attachment', question: 'Does it start in the right place?', choices: ['Yes', 'Adjust the attachment or direction'] }];
    report.limitations = ['VFX inspection currently reads recipe parameters, not simulated particles or rendered effect geometry. Attach screenshots for a visual critique.'];
    return { report };
  }
  report.metrics.push({ id: 'duration', label: 'Duration', value: recipe.duration, unit: 'seconds', detail: recipe.loop ? 'Looping clip' : 'Plays once', sampleIds: [] });
  report.questions = [
    { id: 'weight', question: 'Does the character feel heavy enough?', choices: ['Yes, keep the weight', 'Heavier with stronger impacts', 'Lighter and quicker'] },
    { id: 'timing', question: 'What should change about the pacing?', choices: ['Keep this pacing', 'More anticipation and recovery', 'Faster action', 'Slower overall'] },
    { id: 'contacts', question: 'Do the feet and hands look right in the preview?', choices: ['Yes', 'Feet need work', 'Hands or arms need work', 'Both need work'] },
  ];
  if (!raw) {
    report.findings.push({ id: 'no-studio-data', severity: 'unknown', title: 'Live motion has not been inspected', detail: 'Connect Studio and select a rig, then run Inspect & ask me. Recipe validity does not prove the animation looks correct.', sampleIds: [] });
    report.limitations.push('No posed rig samples or viewport images were captured.');
    return { report };
  }
  const telemetry = telemetrySchema.parse(raw);
  if (telemetry.duration !== recipe.duration || telemetry.loop !== recipe.loop) throw new Error('Sampled animation timing does not match this recipe.');
  const frames = telemetry.samples, first = frames[0]!, last = frames.at(-1)!;
  const nodeIndex = telemetry.nodes.findIndex(n => /^(LowerTorso|Torso|hips|pelvis)$/i.test(n.name));
  const root = nodeIndex < 0 ? telemetry.nodes.findIndex(n => n.driven) : nodeIndex;
  if (root >= 0) {
    const ordered = [...frames].sort((a, b) => a.points[root]![1] - b.points[root]![1]);
    report.metrics.push({ id: 'body-rise', label: 'Body rise / drop', value: round(ordered.at(-1)!.points[root]![1] - ordered[0]!.points[root]![1]), unit: 'studs', detail: 'Range of the sampled pelvis or first driven node, relative to the rest rig.', sampleIds: [ordered[0]!.id, ordered.at(-1)!.id] });
    report.metrics.push({ id: 'body-travel', label: 'Body travel', value: round(distance(first.points[root]!, last.points[root]!, true)), unit: 'studs', detail: 'Horizontal displacement from the first pose to the last.', sampleIds: [first.id, last.id] });
  }
  let endpointGap = 0, velocityGap = 0, velocityNode = '';
  for (let n = 0; n < telemetry.nodes.length; n++) {
    endpointGap = Math.max(endpointGap, distance(first.points[n]!, last.points[n]!));
    const after = frames[1]!, before = frames.at(-2)!;
    const incoming = last.points[n]!.map((v, axis) => (v - before.points[n]![axis]!) / (last.time - before.time));
    const outgoing = after.points[n]!.map((v, axis) => (v - first.points[n]![axis]!) / (after.time - first.time));
    const gap = distance(incoming, outgoing);
    if (gap > velocityGap) { velocityGap = gap; velocityNode = telemetry.nodes[n]!.name; }
  }
  if (recipe.loop) {
    report.metrics.push({ id: 'loop-position-gap', label: 'Loop position gap', value: round(endpointGap), unit: 'studs', detail: 'Largest node position difference between the two loop endpoints.', sampleIds: [first.id, last.id] });
    report.metrics.push({ id: 'loop-velocity-gap', label: 'Loop velocity change', value: round(velocityGap), unit: 'studs / second', detail: `Largest estimated velocity change, at ${velocityNode}. This uses finite samples and needs visual confirmation.`, sampleIds: [first.id, frames[1]!.id, frames.at(-2)!.id, last.id] });
    if (velocityGap > telemetry.height * 0.4) report.findings.push({ id: 'loop-transition', severity: 'possible_issue', title: 'Check the loop transition', detail: `${velocityNode} changes estimated speed/direction at the seam. Matching endpoint positions alone does not guarantee a smooth loop.`, sampleIds: [first.id, frames[1]!.id, frames.at(-2)!.id, last.id] });
  }
  const feet = telemetry.nodes.flatMap((node, index) => node.foot ? [index] : []);
  for (const foot of feet) {
    const name = telemetry.nodes[foot]!.name;
    const lowest = frames.reduce((a, b) => b.bottoms[foot]! < a.bottoms[foot]! ? b : a);
    const highest = frames.reduce((a, b) => b.bottoms[foot]! > a.bottoms[foot]! ? b : a);
    report.metrics.push({ id: `clearance-${foot}`, label: `${name} lift`, value: round(highest.bottoms[foot]!), unit: 'studs', detail: 'Highest sampled sole bound above the estimated rest ground plane.', sampleIds: [highest.id] });
    if (lowest.bottoms[foot]! < -telemetry.height * 0.025) report.findings.push({ id: `ground-${foot}`, severity: 'possible_issue', title: `${name} passes below estimated ground`, detail: `The sole bound reaches ${round(lowest.bottoms[foot]!)} studs relative to the rest plane. Check the actual floor, rig placement and foot roll before treating this as penetration.`, sampleIds: [lowest.id] });
    let travel = 0; const ids = new Set<string>();
    for (let i = 1; i < frames.length; i++) {
      const a = frames[i - 1]!, b = frames[i]!;
      if (Math.abs(a.bottoms[foot]!) <= telemetry.height * 0.03 && Math.abs(b.bottoms[foot]!) <= telemetry.height * 0.03) {
        travel += distance(a.points[foot]!, b.points[foot]!, true); ids.add(a.id); ids.add(b.id);
      }
    }
    report.metrics.push({ id: `contact-travel-${foot}`, label: `${name} near-ground travel`, value: round(travel), unit: 'studs', detail: 'Horizontal foot travel while both sampled sole bounds are near the estimated ground. This is not proof of sliding; in-place walks need backward foot travel.', sampleIds: [...ids].slice(0, 12) });
    if (mode === 'stationary' && travel > telemetry.height * 0.08) report.findings.push({ id: `contact-${foot}`, severity: 'possible_issue', title: `Check ${name} contact`, detail: 'You marked this as stationary, but the foot travels near the estimated floor. Check whether that movement is intentional.', sampleIds: [...ids].slice(0, 8) });
  }
  if (!feet.length) report.findings.push({ id: 'no-feet', severity: 'unknown', title: 'Foot contact is unknown', detail: 'No animated node names contain “foot”. Contact checks need a recognizable foot node or a visual review.', sampleIds: [] });
  if (!report.findings.length) report.findings.push({ id: 'no-flags', severity: 'note', title: 'No large motion flags from these samples', detail: 'This does not certify motion quality. Judge silhouette, intention, weight, hands, and timing in the preview.', sampleIds: [first.id, last.id] });
  report.limitations.push('Samples come from the Studio pose evaluator, not gameplay physics or video.', 'The diagram shows joint positions, not skin, clothing, hair, textures, or collisions.', 'Ground uses rest-pose bounds. Foot travel in an in-place walk can be correct; gameplay speed is not measured.', `Sample interval varies around markers; ${frames.length} poses cannot expose every event between samples.`);
  return { report, telemetry };
}
