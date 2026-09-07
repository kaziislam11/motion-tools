local EnergyColumn = {}

function EnergyColumn.sample(recipe, time)
    local settings = recipe.column
    local alive = time >= 0 and time < recipe.lifetime
    local progress = math.clamp(time / settings.travelTime, 0, 1)
    local opacity = alive and math.clamp((recipe.lifetime - time) / settings.fadeTime, 0, 1) or 0
    return {
        length = settings.length * progress,
        opacity = opacity,
        arrived = alive and time >= settings.travelTime,
        impactAge = math.max(0, time - settings.travelTime),
    }
end

function EnergyColumn.create(attachment, recipe)
    local left, right, root
    if recipe.column.origin == "hands" then
        local rig = attachment:FindFirstAncestorOfClass("Model")
        assert(rig, "Hand-origin column needs a rig model.")
        left, right, root = Rig.part(rig, "LeftHand"), Rig.part(rig, "RightHand"), Rig.part(rig, "HumanoidRootPart")
    end
    local model = Instance.new("Model")
    model.Name = "EnergyColumnPreview"
    model.Parent = attachment
    local function part(name, shape, color)
        local value = Instance.new("Part")
        value.Name, value.Shape, value.Color = name, shape, color
        value.Anchored, value.CanCollide, value.CanTouch, value.CanQuery = true, false, false, false
        value.CastShadow = false
        value.Material = Enum.Material.Neon
        value.Transparency = 1
        value.Parent = model
        return value
    end
    local blue = Color3.new(unpack(recipe.color))
    local pale = blue:Lerp(Color3.new(1, 1, 1), 0.85)
    local core = part("Core", Enum.PartType.Cylinder, pale)
    local shell = part("OuterEnergy", Enum.PartType.Cylinder, blue)
    local head = part("LeadingEdge", Enum.PartType.Ball, pale)
    local halo = part("LeadingGlow", Enum.PartType.Ball, blue)
    local source = part("Muzzle", Enum.PartType.Ball, pale)
    local impact = part("Impact", Enum.PartType.Ball, blue)
    local function update(time)
        if not model.Parent or not attachment.Parent then return end
        local state = EnergyColumn.sample(recipe, time)
        local origin = attachment.WorldCFrame
        if left then
            local center = (left.Position + right.Position) / 2
            origin = CFrame.lookAt(center, center + root.CFrame.LookVector)
        end
        local width = recipe.size * (1 + 0.035 * math.sin(time * 35))
        local length = math.max(0.01, state.length)
        local center = origin * CFrame.new(0, 0, -length / 2) * CFrame.Angles(0, math.pi / 2, 0)
        core.CFrame, shell.CFrame = center, center
        core.Size = Vector3.new(length, width * 0.58, width * 0.58)
        shell.Size = Vector3.new(length, width, width)
        head.CFrame = origin * CFrame.new(0, 0, -length)
        halo.CFrame = head.CFrame
        head.Size = Vector3.one * width * 0.8
        halo.Size = Vector3.one * width * 1.35
        source.CFrame, source.Size = origin, Vector3.one * width * 0.85
        core.Transparency = 1 - state.opacity
        shell.Transparency = 1 - state.opacity * 0.45
        head.Transparency = 1 - state.opacity
        halo.Transparency = 1 - state.opacity * 0.3
        source.Transparency = 1 - state.opacity * 0.9
        impact.CFrame = origin * CFrame.new(0, 0, -recipe.column.length)
        local expansion = math.min(state.impactAge / 0.35, 1)
        impact.Size = Vector3.one * width * (1.4 + expansion * 2.5)
        impact.Transparency = state.arrived and (1 - state.opacity * (1 - expansion) * 0.6) or 1
    end
    update(0)
    return { update = update }
end

return EnergyColumn
