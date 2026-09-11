local RunService = game:GetService("RunService")
local Preview = {}
local active, connection

function Preview.model() return active end

function Preview.stop()
    if connection then connection:Disconnect(); connection = nil end
    if active then active:Destroy(); active = nil end
    return { stopped = true }
end

function Preview.copy(model)
    local priorArchivable = model.Archivable
    model.Archivable = true
    local ok, clone = pcall(function() return model:Clone() end)
    model.Archivable = priorArchivable
    assert(ok and clone, "Could not clone the selected rig.")
    local prepared, err = pcall(function()
        for _, item in clone:GetDescendants() do
            if item:IsA("LuaSourceContainer") then item:Destroy() end
            if item:IsA("BasePart") then item.Anchored = true; item.CanCollide = false; item.CanQuery = false; item.CanTouch = false end
            if item:IsA("ParticleEmitter") or item:IsA("Trail") or item:IsA("Beam") then item.Enabled = false end
        end
    end)
    if not prepared then clone:Destroy(); error(err) end
    return clone
end

function Preview.start(model, payload)
    Preview.stop()
    assert(not RunService:IsRunning(), "Stop Play/Test mode before previewing.")
    local clone = Preview.copy(model)
    active = clone
    local success, result = pcall(function()
        clone.Name = "MotionPreview_" .. model.Name
        clone.Parent = workspace
        local size = model:GetExtentsSize()
        clone:PivotTo(model:GetPivot() * CFrame.new(size.X + 3, 0, 0))
        local nodes, tracks = {}, {}
        if payload.animation then
            local _
            _, nodes, tracks = Authoring.tracks(clone, payload.animation, payload.jointMap or {})
        end
        local accessories = Rig.accessoryBindings(clone)
        local cues = {}
        for _, cue in payload.effects do
            table.insert(cues, { time = cue.time, recipe = cue.recipe, part = Rig.part(clone, cue.part), fired = false })
        end
        -- Evaluate joints ourselves so edit-mode preview does not depend on uploaded IDs.
        local elapsed = 0
        connection = RunService.Heartbeat:Connect(function(delta)
            local tickOk, tickError = pcall(function()
                elapsed += delta
                if not clone.Parent or elapsed > payload.seconds then Preview.stop(); return end
                local time = elapsed
                if payload.animation then
                    time = payload.sampleTime or (payload.animation.loop and (elapsed % payload.animation.duration) or math.min(elapsed, payload.animation.duration))
                    Authoring.apply(nodes, tracks, time)
                end
                for _, accessory in accessories do
                    accessory.handle.CFrame = accessory.body.CFrame * accessory.offset
                end
                for _, cue in cues do
                    if not cue.fired and elapsed >= cue.time then
                        cue.fired = true
                        local attachment
                        attachment, cue.controller = Authoring.effect(cue.part, cue.recipe, true)
                    end
                    if cue.controller then cue.controller.update(elapsed - cue.time) end
                end
            end)
            if not tickOk then warn("Motion preview stopped: " .. tostring(tickError)); Preview.stop() end
        end)
        return { previewStarted = true, seconds = payload.seconds, model = clone.Name, note = "Temporary clone; effects fire once per preview. Visual inspection required." }
    end)
    if not success then Preview.stop(); error(result) end
    return result
end

return Preview
