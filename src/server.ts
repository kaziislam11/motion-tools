import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Queue } from './bridge.js';
import { Library } from './library.js';
import { Blender } from './blender.js';
import { animationPreset, effectPreset, identifier, label, motionPreset, recipeSchema, vec3, vfxPreset } from './recipes.js';

const sessionId = identifier.optional().describe('Studio session from motion_studio_sessions. Required when multiple sessions are connected.');
const rigId = identifier.describe('Stable selected model ID from motion_studio_sessions.');
const jointMap = z.record(label, label).default({}).describe('Optional recipe joint name to actual rig part/bone name mapping. Does not convert local axes.');
const blendFile = z.string().min(1).max(2048).describe('Absolute path to an existing saved .blend file. The original is never overwritten.');
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

export function createMcp(library: Library, queue: Queue, blender: Blender) {
  const server = new McpServer({ name: 'roblox-motion-mcp-server', version: '0.1.0' }, {
    instructions: 'Authoring toolset for rigging, animation and VFX, not game logic. Inspect before modifying. Keep revisions in the library. Studio commands return queued jobs; check motion_studio_job for confirmed results. Never claim queued work succeeded. Preview before saving scene assets. Blender humanoid fitting is approximate and requires visual review. Recipe rotations are local XYZ degrees; Blender and Roblox rig axes can differ.',
  });
  function add<S extends z.ZodRawShape>(name: string, description: string, shape: S, annotations: typeof readOnly, run: (args: z.output<z.ZodObject<S>>) => unknown | Promise<unknown>) {
    const schema = z.object(shape).strict();
    server.registerTool(name, { title: name.replaceAll('_', ' '), description, inputSchema: shape as z.ZodRawShape, outputSchema: { result: z.unknown() }, annotations }, async (input) => {
      try {
        const result = await run(schema.parse(input));
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: { result } };
      } catch (error) {
        return { isError: true, content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }] };
      }
    });
  }
  async function recipe(id: string, kind: 'animation' | 'vfx') {
    const asset = await library.get(id);
    if (asset.recipe.kind !== kind) throw new Error(`Expected a ${kind} asset.`);
    return asset.recipe;
  }
  const submit = (id: string | undefined, operation: string, payload: unknown) => {
    const job = queue.enqueue(id, operation, payload);
    return { jobId: job.id, status: job.status, sessionId: job.sessionId, next: 'Call motion_studio_job to confirm the result. Queued is not completed.' };
  };

  add('motion_capabilities', 'Discover available authoring operations, presets, limits, and connection requirements.', {}, readOnly, () => ({
    animations: ['idle', 'walk', 'cast', 'slash', 'custom keyframes'], vfx: ['charge', 'impact', 'heal', 'custom particle emitter'],
    studio: ['inspect Motor6D/Bone rigs', 'connect rigid parts', 'save KeyframeSequence', 'save VFX attachment', 'preview animation with timed VFX on a clone'],
    blender: ['inspect saved .blend', 'fit 16-bone humanoid guide', 'automatic skin weights with audit', 'create bone animation', 'export active FBX clip'],
    limits: { animationSeconds: 30, totalKeys: 4096, previewSeconds: 30, maxParticleBurst: 500, maxMeshVerticesForRigging: 200000 },
    notes: ['Use a connected MCP client as the AI interface.', 'Studio must load the paired plugin and be in edit mode.', 'Blender .blend must be saved to disk; unsaved UI changes are not visible.', 'Humanoid guide assumes Z-up T-pose. Not universal auto-rigging.', 'Same joint names do not imply matching bone axes; review animation on each target.', 'No publishing, external model generation, or gameplay code.'],
  }));
  add('motion_library_list', 'List saved recipes and immutable revisions. Paginated, metadata only.', { offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(100).default(30) }, readOnly, p => library.list(p.offset, p.limit));
  add('motion_library_read', 'Read a complete editable animation or VFX recipe by asset ID.', { assetId: identifier }, readOnly, p => library.get(p.assetId));
  add('motion_library_save', 'Validate and save a custom recipe or revised recipe. Supply parentId to preserve revision lineage. All positions are local units; rotations are local XYZ degrees; key times are seconds.', { recipe: recipeSchema, parentId: identifier.optional() }, write, p => library.save(p.recipe, p.parentId));
  add('motion_animation_create', 'Create an editable simple animation preset in the library. Does not yet modify a rig. Local joint axes need visual review.', { preset: motionPreset, name: label, duration: z.number().min(0.1).max(30).default(2), intensity: z.number().min(0.1).max(2).default(1) }, write, p => library.save(animationPreset(p.preset, p.name, p.duration, p.intensity)));
  add('motion_vfx_create', 'Create an editable native Roblox particle recipe. Read and revise the recipe to change color, size, speed, texture, or emission.', { preset: effectPreset, name: label }, write, p => library.save(vfxPreset(p.preset, p.name)));
  add('motion_studio_sessions', 'Inspect connected Studio places and selected model IDs. Select a rig in Studio before dispatching commands.', {}, readOnly, () => queue.listSessions());
  add('motion_studio_inspect', 'Queue inspection of a specific rig: parts, joints, animated names, and structural issues. Check job result for the report.', { sessionId, rigId }, readOnly, p => submit(p.sessionId, 'inspect', { rigId: p.rigId }));
  add('motion_studio_connect_parts', 'Create a Motor6D between two uniquely named parts without moving their rest positions. Rejects cycles, existing child motors and conflicting welds. Anchoring is preserved. Pivot is a world-space position in studs.', { sessionId, rigId, parentPart: label, childPart: label, name: label, pivot: vec3.optional() }, write, p => submit(p.sessionId, 'connect_parts', p));
  add('motion_studio_save_animation', 'Save a library animation as a new native KeyframeSequence in the rig\'s AnimSaves location, with an undo recording. New saves use a ServerStorage folder referenced by an ObjectValue. Does not upload or publish.', { sessionId, rigId, assetId: identifier, jointMap }, write, async p => submit(p.sessionId, 'save_animation', { ...p, recipe: await recipe(p.assetId, 'animation') }));
  add('motion_studio_save_vfx', 'Save a library VFX recipe as a new Attachment and disabled ParticleEmitter on a uniquely named part. EmitCount records the burst amount. Undoable.', { sessionId, rigId, assetId: identifier, part: label }, write, async p => submit(p.sessionId, 'save_vfx', { ...p, recipe: await recipe(p.assetId, 'vfx') }));
  add('motion_studio_preview', 'Preview animation and timed VFX together on a temporary clone beside the rig. No uploaded animation ID needed. Cues fire once; original rig is untouched. Stop removes the clone.', {
    sessionId, rigId, animationId: identifier.optional(), jointMap, seconds: z.number().min(0.1).max(30).default(5),
    effects: z.array(z.object({ assetId: identifier, part: label, time: z.number().min(0).max(30) }).strict()).max(12).default([]),
  }, write, async p => {
    if (!p.animationId && !p.effects.length) throw new Error('Supply an animationId or at least one VFX cue.');
    if (p.effects.some(e => e.time >= p.seconds)) throw new Error('Effect cue times must be earlier than the preview duration.');
    return submit(p.sessionId, 'preview', { rigId: p.rigId, jointMap: p.jointMap, seconds: p.seconds,
      animation: p.animationId ? await recipe(p.animationId, 'animation') : undefined,
      effects: await Promise.all(p.effects.map(async e => ({ part: e.part, time: e.time, recipe: await recipe(e.assetId, 'vfx') }))),
    });
  });
  add('motion_studio_stop_preview', 'Stop the temporary preview and remove its clone and effects.', { sessionId }, { ...write, idempotentHint: true }, p => submit(p.sessionId, 'stop_preview', {}));
  add('motion_studio_job', 'Get a Studio job outcome: queued, running, succeeded, failed, expired, or unknown. Unknown means acknowledgement was lost; inspect the scene before retrying.', { jobId: identifier }, readOnly, p => {
    const { payload: _, ...job } = queue.get(p.jobId);
    return job;
  });
  add('motion_blender_inspect', 'Inspect meshes, world bounds, armatures and bone names in a saved .blend file using background Blender. Source file is unchanged.', { blendFile }, readOnly, p => blender.run(p.blendFile, { operation: 'inspect' }));
  add('motion_blender_rig_humanoid', 'Create a new 16-bone humanoid armature on an unparented, unrigged mesh. Bounding-box guides assume Z-up T-pose, centered depth. Optional world-space landmarks refine joint placement. Automatic weights are trimmed to four influences and audited. Saves a new .blend; inspect skinning visually.', {
    blendFile, mesh: label, name: label.default('MotionRig'), bind: z.boolean().default(true),
    landmarks: z.record(label, vec3).default({}).describe('World-space root, hips, chest, neck, head, and Left/Right Shoulder, Elbow, Wrist, HandTip, Hip, Knee, Ankle, Toe (e.g. LeftElbow).'),
  }, write, p => blender.run(p.blendFile, { operation: 'rig_humanoid', ...p }));
  add('motion_blender_animate', 'Apply a library animation to a named Blender armature and save a new .blend with a new action. Local bone axes determine motion; name mapping is not axis retargeting.', { blendFile, armature: label, assetId: identifier, jointMap }, write, async p => blender.run(p.blendFile, { operation: 'animate', armature: p.armature, jointMap: p.jointMap, recipe: await recipe(p.assetId, 'animation') }));
  add('motion_blender_export_fbx', 'Export the named armature, bound meshes, and its active clip to a new FBX with leaf bones disabled and animation baked. Rejects unweighted or invalid influence counts. Verify scale in Roblox Studio.', { blendFile, armature: label }, write, p => blender.run(p.blendFile, { operation: 'export_fbx', armature: p.armature }));
  return server;
}
