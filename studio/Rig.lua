local HttpService = game:GetService("HttpService")
local Selection = game:GetService("Selection")
local ids = setmetatable({}, { __mode = "k" })
local objects = setmetatable({}, { __mode = "v" })
local Rig = {}

function Rig.isPartJoint(item)
    return item:IsA("Motor6D") or item:IsA("AnimationConstraint")
end

-- Anchored previews need to carry rigid accessories explicitly.
function Rig.accessoryBindings(model)
    local bindings, bodyAttachments = {}, {}
    for _, item in model:GetDescendants() do
        if item:IsA("Attachment") and item.Parent:IsA("BasePart") and not item:FindFirstAncestorOfClass("Accessory") then
            bodyAttachments[item.Name] = bodyAttachments[item.Name] or {}
            table.insert(bodyAttachments[item.Name], item.Parent)
        end
    end
    for _, accessory in model:GetDescendants() do
        if accessory:IsA("Accessory") then
            local handle = accessory:FindFirstChild("Handle")
            if handle and handle:IsA("BasePart") then
                local body
                for _, joint in model:GetDescendants() do
                    local a, b
                    if joint:IsA("Weld") or joint:IsA("WeldConstraint") then
                        a, b = joint.Part0, joint.Part1
                    elseif joint:IsA("RigidConstraint") then
                        a = joint.Attachment0 and joint.Attachment0.Parent
                        b = joint.Attachment1 and joint.Attachment1.Parent
                    end
                    local candidate = a == handle and b or (b == handle and a)
                    if candidate and candidate:IsA("BasePart") and candidate:IsDescendantOf(model) and not candidate:FindFirstAncestorOfClass("Accessory") then
                        body = candidate
                        break
                    end
                end
                if not body then
                    for _, attachment in handle:GetChildren() do
                        local matches = bodyAttachments[attachment.Name]
                        if attachment:IsA("Attachment") and matches and #matches == 1 then
                            body = matches[1]
                            break
                        end
                    end
                end
                if body then
                    for _, part in accessory:GetDescendants() do
                        if part:IsA("BasePart") then
                            table.insert(bindings, { handle = part, body = body, offset = body.CFrame:ToObjectSpace(part.CFrame) })
                        end
                    end
                end
            end
        end
    end
    return bindings
end

function Rig.id(instance)
    if not ids[instance] then
        ids[instance] = HttpService:GenerateGUID(false)
        objects[ids[instance]] = instance
    end
    return ids[instance]
end

function Rig.resolve(id)
    local model = objects[id]
    assert(model and model:IsA("Model") and model:IsDescendantOf(workspace), "Rig is no longer in Workspace. Inspect the selection again.")
    return model
end

function Rig.part(model, name)
    local found
    for _, item in model:GetDescendants() do
        if item:IsA("BasePart") and item.Name == name then
            assert(not found, "Duplicate part name: " .. name)
            found = item
        end
    end
    assert(found, "Part not found: " .. name)
    return found
end

function Rig.nodes(model)
    local motors, bones = {}, {}
    for _, item in model:GetDescendants() do
        if Rig.isPartJoint(item) then table.insert(motors, item) end
        if item:IsA("Bone") then table.insert(bones, item) end
    end
    assert(#motors + #bones <= 256, "Rig exceeds the 256-joint limit.")
    assert(not (#motors > 0 and #bones > 0), "Mixed Motor6D/Bone rigs need a separate selected sub-rig in this version.")
    local nodes, byObject, byName = {}, {}, {}
    local function node(part)
        if byObject[part] then return byObject[part] end
        assert(not byName[part.Name], "Duplicate animated name: " .. part.Name .. ". Give joints/parts unique names.")
        local entry = { name = part.Name, object = part, children = {} }
        byObject[part], byName[part.Name] = entry, entry
        table.insert(nodes, entry)
        return entry
    end
    if #motors > 0 then
        for _, motor in motors do
            assert(motor.Part0 and motor.Part1, "Disconnected Motor6D: " .. motor.Name)
            assert(motor.Part0:IsDescendantOf(model) and motor.Part1:IsDescendantOf(model), "Joint connects outside the selected rig.")
            local parent, child = node(motor.Part0), node(motor.Part1)
            assert(not child.target, "Multiple motors drive " .. child.name)
            child.target, child.parent = motor, parent
            table.insert(parent.children, child)
        end
    else
        for _, bone in bones do
            local parent = bone.Parent
            assert(parent and (parent:IsA("Bone") or parent:IsA("BasePart")), "Bone needs a Bone or BasePart parent.")
            local parentNode, child = node(parent), node(bone)
            child.target, child.parent = bone, parentNode
            table.insert(parentNode.children, child)
        end
    end
    local roots = {}
    for _, item in nodes do if not item.parent then table.insert(roots, item) end end
    local visited, ordered = {}, {}
    local function visit(item)
        assert(not visited[item], "Rig contains a joint cycle.")
        visited[item] = true
        table.insert(ordered, item)
        for _, child in item.children do visit(child) end
    end
    for _, root in roots do visit(root) end
    local count = 0
    for _ in visited do count += 1 end
    assert(count == #nodes, "Rig contains a disconnected joint cycle.")
    return roots, byName, ordered
end

function Rig.inspect(model)
    local result = { id = Rig.id(model), name = model.Name, parts = {}, joints = {}, issues = {} }
    for _, item in model:GetDescendants() do
        if item:IsA("BasePart") and #result.parts < 256 then
            table.insert(result.parts, { name = item.Name, anchored = item.Anchored })
        elseif (Rig.isPartJoint(item) or item:IsA("Bone")) and #result.joints < 256 then
            table.insert(result.joints, { name = item.Name, kind = item.ClassName })
        end
    end
    local ok, roots, _, nodes = pcall(Rig.nodes, model)
    if ok then
        result.animatedNames = {}
        for _, item in nodes do
            table.insert(result.animatedNames, { name = item.name, parent = item.parent and item.parent.name or "", driven = item.target ~= nil })
        end
        if #roots == 0 then table.insert(result.issues, "No animation joints. Use motion_studio_connect_parts or the Blender rigging tool.") end
    else table.insert(result.issues, tostring(roots)) end
    return result
end

function Rig.snapshot()
    local selected, seen = {}, {}
    for _, item in Selection:Get() do
        local model = item:IsA("Model") and item or item:FindFirstAncestorOfClass("Model")
        if model and model:IsDescendantOf(workspace) and not seen[model] and #selected < 8 then
            seen[model] = true
            table.insert(selected, { id = Rig.id(model), name = model.Name })
        end
    end
    return { place = game.Name, placeId = tostring(game.PlaceId), selection = selected }
end

function Rig.connect(model, payload)
    local parent = Rig.part(model, payload.parentPart)
    local child = Rig.part(model, payload.childPart)
    assert(parent ~= child, "A part cannot be its own parent.")
    local upward = {}
    for _, item in model:GetDescendants() do
        if Rig.isPartJoint(item) and item.Part1 then
            assert(item.Part1 ~= child, "Child already has a Motor6D. Inspect or edit the existing joint.")
            upward[item.Part1] = item.Part0
        end
        if (item:IsA("Weld") or item:IsA("WeldConstraint")) and (item.Part0 == child or item.Part1 == child) then
            error("Child has a weld. Remove the conflicting weld before creating its animation joint.")
        end
    end
    local cursor, visited = parent, {}
    while cursor do
        assert(cursor ~= child and not visited[cursor], "Connection would create a joint cycle.")
        visited[cursor] = true
        cursor = upward[cursor]
    end
    local pivot = payload.pivot and Vector3.new(unpack(payload.pivot)) or child.Position
    local joint = Instance.new("Motor6D")
    joint.Name = payload.name
    joint.Part0, joint.Part1 = parent, child
    joint.C0 = parent.CFrame:ToObjectSpace(CFrame.new(pivot))
    joint.C1 = child.CFrame:ToObjectSpace(CFrame.new(pivot))
    joint.Parent = parent
    return { name = joint.Name, childAnchored = child.Anchored, note = "Joint created. Anchoring was preserved; check anchors before gameplay." }
end

return Rig
