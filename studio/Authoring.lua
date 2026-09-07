local Authoring = {}

function Authoring.transform(key)
    return CFrame.new(unpack(key.position)) * CFrame.Angles(math.rad(key.rotation[1]), math.rad(key.rotation[2]), math.rad(key.rotation[3]))
end

function Authoring.sample(track, time)
    local keys = track.keys
    if time <= keys[1].time then return Authoring.transform(keys[1]) end
    for index = 2, #keys do
        local right, left = keys[index], keys[index - 1]
        if time <= right.time then
            local alpha = (time - left.time) / (right.time - left.time)
            return Authoring.transform(left):Lerp(Authoring.transform(right), alpha)
        end
    end
    return Authoring.transform(keys[#keys])
end

function Authoring.tracks(model, recipe, mapping)
    local roots, byName, nodes = Rig.nodes(model)
    local tracks = {}
    for _, track in recipe.tracks do
        local name = mapping[track.joint] or track.joint
        assert(byName[name] and byName[name].target, "Animation joint not found: " .. name .. ". Inspect the rig and supply jointMap.")
        assert(not tracks[name], "Two animation tracks map to " .. name)
        tracks[name] = track
    end
    return roots, nodes, tracks
end

function Authoring.sequence(model, recipe, mapping)
    local roots, _, tracks = Authoring.tracks(model, recipe, mapping)
    local times = {}
    for _, track in recipe.tracks do for _, key in track.keys do times[key.time] = true end end
    for _, marker in recipe.markers do times[marker.time] = true end
    local sorted = {}
    for time in times do table.insert(sorted, time) end
    table.sort(sorted)
    local sequence = Instance.new("KeyframeSequence")
    sequence.Name, sequence.Loop, sequence.Priority = recipe.name, recipe.loop, Enum.AnimationPriority.Action
    local function poseFor(node, time)
        local pose = Instance.new("Pose")
        pose.Name = node.name
        pose.Weight = tracks[node.name] and 1 or 0
        pose.EasingStyle = Enum.PoseEasingStyle.Linear
        pose.CFrame = tracks[node.name] and Authoring.sample(tracks[node.name], time) or CFrame.identity
        for _, child in node.children do pose:AddSubPose(poseFor(child, time)) end
        return pose
    end
    for _, time in sorted do
        local frame = Instance.new("Keyframe")
        frame.Time = time
        for _, root in roots do frame:AddPose(poseFor(root, time)) end
        for _, event in recipe.markers do
            if event.time == time then
                local marker = Instance.new("KeyframeMarker")
                marker.Name = event.name
                frame:AddMarker(marker)
            end
        end
        sequence:AddKeyframe(frame)
    end
    return sequence
end

function Authoring.saveDestination(model)
    local reference = model:FindFirstChild("AnimSaves")
    if reference then
        if reference:IsA("Folder") then return reference end -- Legacy Studio saves.
        assert(reference:IsA("ObjectValue"), "AnimSaves exists but is not an animation save reference.")
        if reference.Value then
            assert(reference.Value:IsA("Folder"), "AnimSaves reference must target a Folder.")
            return reference.Value
        end
    end
    local folder = Instance.new("Folder")
    folder.Name = model.Name .. "_Motion_" .. game:GetService("HttpService"):GenerateGUID(false)
    folder.Parent = game:GetService("ServerStorage")
    if not reference then
        reference = Instance.new("ObjectValue")
        reference.Name = "AnimSaves"
        reference.Parent = model
    end
    reference.Value = folder
    return folder
end

function Authoring.effect(parent, recipe, active)
    local attachment = Instance.new("Attachment")
    attachment.Name = recipe.name
    attachment.Position = Vector3.new(unpack(recipe.offset))
    if recipe.beam then
        local endpoint = Instance.new("Attachment")
        endpoint.Name = "Endpoint"
        endpoint.Position = Vector3.new(0, 0, -recipe.beam.length)
        endpoint.Parent = attachment
        local beams = {}
        for _, layer in { { "Glow", 1, Color3.new(unpack(recipe.color)), 0.25 }, { "Core", 0.35, Color3.new(0.85, 0.97, 1), 0 } } do
            local beam = Instance.new("Beam")
            beam.Name = layer[1]
            beam.Attachment0, beam.Attachment1 = attachment, endpoint
            beam.Width0, beam.Width1 = recipe.size * layer[2], recipe.size * layer[2]
            beam.Color = ColorSequence.new(layer[3])
            beam.Transparency = NumberSequence.new(layer[4])
            beam.FaceCamera = true
            beam.LightEmission, beam.LightInfluence = recipe.lightEmission, 0
            beam.Segments = 1
            beam.Enabled = active
            beam.Parent = attachment
            table.insert(beams, beam)
        end
        attachment:SetAttribute("Duration", recipe.lifetime)
        attachment.Parent = parent
        if active then
            task.delay(recipe.lifetime, function()
                for _, beam in beams do
                    if beam.Parent then beam.Enabled = false end
                end
            end)
        end
        return attachment
    end
    local emitter = Instance.new("ParticleEmitter")
    emitter.Name = "Particles"
    emitter.Texture = recipe.texture or "rbxasset://textures/particles/sparkles_main.dds"
    emitter.Color = ColorSequence.new(Color3.new(unpack(recipe.color)))
    emitter.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, recipe.size), NumberSequenceKeypoint.new(1, 0) })
    emitter.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.05), NumberSequenceKeypoint.new(1, 1) })
    emitter.Lifetime = NumberRange.new(recipe.lifetime)
    emitter.Speed = NumberRange.new(recipe.speed)
    emitter.SpreadAngle = Vector2.new(recipe.spread, recipe.spread)
    emitter.LightEmission = recipe.lightEmission
    emitter.Rate, emitter.Enabled = recipe.rate, active
    emitter:SetAttribute("EmitCount", recipe.count)
    emitter.Parent = attachment
    attachment.Parent = parent
    if active then emitter:Emit(recipe.count) end
    return attachment
end

return Authoring
