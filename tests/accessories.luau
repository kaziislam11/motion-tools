local function object(kind, name, parent)
    local item = {ClassName=kind, Name=name, Parent=parent, children={}}
    if parent then table.insert(parent.children, item) end
    function item:IsA(k) return k == self.ClassName end
    function item:GetChildren() return self.children end
    function item:GetDescendants()
        local result = {}
        for _, child in self.children do
            table.insert(result, child)
            for _, descendant in child:GetDescendants() do table.insert(result, descendant) end
        end
        return result
    end
    function item:FindFirstChild(n)
        for _, child in self.children do if child.Name == n then return child end end
    end
    function item:FindFirstAncestorOfClass(k)
        local ancestor = self.Parent
        while ancestor do if ancestor:IsA(k) then return ancestor end; ancestor = ancestor.Parent end
    end
    function item:IsDescendantOf(root)
        local ancestor = self.Parent
        while ancestor do if ancestor == root then return true end; ancestor = ancestor.Parent end
        return false
    end
    item.CFrame = {ToObjectSpace=function(_, other) return other end}
    return item
end
for _, kind in {"Weld", "WeldConstraint", "RigidConstraint", "AttachmentFallback"} do
    local model = object("Model", "Rig")
    local body = object("BasePart", "Head", model)
    local bodyAttachment = object("Attachment", "HairAttachment", body)
    local accessory = object("Accessory", "Hair", model)
    local handle = object("BasePart", "Handle", accessory)
    local extra = object("BasePart", "Extra", accessory)
    local attachment = object("Attachment", "HairAttachment", handle)
    if kind ~= "AttachmentFallback" then
        -- Joint deliberately lives outside Handle, and endpoints are reversed.
        local joint = object(kind, "Joint", body)
        joint.Part0, joint.Part1 = body, handle
        joint.Attachment0, joint.Attachment1 = bodyAttachment, attachment
    end
    local bindings = Rig.accessoryBindings(model)
    assert(#bindings == 2, kind .. " must carry all accessory parts")
    assert(bindings[1].body == body and bindings[1].handle == handle)
    assert(bindings[2].handle == extra)
    assert(bindings[1].offset == handle.CFrame, "Must preserve rest offset")
    print(kind .. " accessory binding passed")
end
