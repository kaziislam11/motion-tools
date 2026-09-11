local MotionInspection = {}
local RunService = game:GetService("RunService")

local function rounded(value)
    assert(value == value and math.abs(value) <= 10000, "Inspection position is not finite or exceeds 10,000 studs from the rig.")
    return math.round(value * 10000) / 10000
end

function MotionInspection.sample(model, payload)
    assert(not RunService:IsRunning(), "Stop Play/Test mode before inspecting an animation.")
    assert(#payload.times >= 2 and #payload.times <= 65, "Inspection requires 2-65 sample times.")
    local prior = -1
    for _, time in payload.times do
        assert(time == time and time >= 0 and time <= payload.recipe.duration and time > prior, "Inspection sample times must increase within the clip.")
        prior = time
    end
    assert(payload.times[1] == 0 and payload.times[#payload.times] == payload.recipe.duration, "Inspection must include both endpoints.")
    local clone = Preview.copy(model)
    -- This detached clone cannot run scripts, enter physics, or disturb an active preview/camera.
    local ok, result = pcall(function()
        local _, nodes, tracks = Authoring.tracks(clone, payload.recipe, payload.jointMap or {})
        assert(#nodes > 0 and #nodes <= 96, "Inspection currently supports 1-96 animated nodes.")
        local reference = model:GetPivot()
        local indexByNode = {}
        for index, node in nodes do indexByNode[node] = index end
        local descriptions, ground, minimum, maximum = {}, math.huge, math.huge, -math.huge
        local function pose(node)
            local object = node.object
            local frame = object:IsA("Bone") and object.TransformedWorldCFrame or object.CFrame
            local localFrame = reference:ToObjectSpace(frame)
            local bottom = localFrame.Y
            if object:IsA("BasePart") then
                local size = object.Size
                bottom -= (math.abs(localFrame.RightVector.Y) * size.X + math.abs(localFrame.UpVector.Y) * size.Y + math.abs(localFrame.LookVector.Y) * size.Z) / 2
            end
            return localFrame.Position, bottom
        end
        for index, node in nodes do
            local position, bottom = pose(node)
            local isFoot = string.find(string.lower(node.name), "foot", 1, true) ~= nil
            if isFoot then ground = math.min(ground, bottom) end
            minimum, maximum = math.min(minimum, bottom), math.max(maximum, 2 * position.Y - bottom)
            descriptions[index] = { name = node.name, parent = node.parent and indexByNode[node.parent] or 0, driven = node.target ~= nil, foot = isFoot }
        end
        local groundSource = ground ~= math.huge and "rest_foot_bounds" or "rest_node_bounds"
        if ground == math.huge then ground = minimum end
        local samples = {}
        for index, time in payload.times do
            Authoring.apply(nodes, tracks, time)
            local points, bottoms = {}, {}
            for n, node in nodes do
                local position, bottom = pose(node)
                points[n] = { rounded(position.X), rounded(position.Y - ground), rounded(position.Z) }
                bottoms[n] = rounded(bottom - ground)
            end
            samples[index] = { id = string.format("s%03d", index - 1), time = time, points = points, bottoms = bottoms }
        end
        return { version = 1, source = "studio_pose_evaluator", rigId = payload.rigId, assetId = payload.assetId,
            duration = payload.recipe.duration, loop = payload.recipe.loop, height = math.max(0.1, maximum - minimum),
            groundSource = groundSource, nodes = descriptions, samples = samples,
            note = "Actual joint poses evaluated in Studio on a detached clone. Ground is estimated from rest bounds. No game physics, cloth simulation, mesh-surface inspection, or viewport image capture." }
    end)
    clone:Destroy()
    assert(ok, result)
    return result
end

return MotionInspection
