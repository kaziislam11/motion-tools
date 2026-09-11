-- Deterministic transform fixture. Native Studio remains the authority for engine behavior.
local function vector(x, y, z) return {X=x, Y=y, Z=z} end
local CFrame = {}
local frameMeta = {}
local function frame(x, y, z, matrix)
    local m = matrix or {1,0,0, 0,1,0, 0,0,1}
    return setmetatable({X=x,Y=y,Z=z,Position=vector(x,y,z),m=m,
        RightVector=vector(m[1],m[4],m[7]),UpVector=vector(m[2],m[5],m[8]),LookVector=vector(-m[3],-m[6],-m[9])}, frameMeta)
end
function CFrame.new(x, y, z) return frame(x or 0,y or 0,z or 0) end
function CFrame.Angles(x, y, z)
    assert(x == 0 and y == 0 and z == 0, "This interpolation fixture uses translation keys")
    return CFrame.new()
end
CFrame.identity = CFrame.new()
function frameMeta.__mul(a,b)
    local m = {}
    for r=0,2 do for c=0,2 do
        m[r*3+c+1] = a.m[r*3+1]*b.m[c+1] + a.m[r*3+2]*b.m[c+4] + a.m[r*3+3]*b.m[c+7]
    end end
    return frame(a.X+a.m[1]*b.X+a.m[2]*b.Y+a.m[3]*b.Z,
        a.Y+a.m[4]*b.X+a.m[5]*b.Y+a.m[6]*b.Z,
        a.Z+a.m[7]*b.X+a.m[8]*b.Y+a.m[9]*b.Z,m)
end
frameMeta.__index = {
    Inverse = function(a)
        local m={a.m[1],a.m[4],a.m[7],a.m[2],a.m[5],a.m[8],a.m[3],a.m[6],a.m[9]}
        return frame(-m[1]*a.X-m[2]*a.Y-m[3]*a.Z,-m[4]*a.X-m[5]*a.Y-m[6]*a.Z,-m[7]*a.X-m[8]*a.Y-m[9]*a.Z,m)
    end,
    ToObjectSpace = function(a,b) return a:Inverse()*b end,
    Lerp = function(a,b,t) return frame(a.X+(b.X-a.X)*t,a.Y+(b.Y-a.Y)*t,a.Z+(b.Z-a.Z)*t,a.m) end,
}
local running = false
local game = {GetService=function() return {IsRunning=function() return running end} end}
local Rig = {
    nodes=function(model) return model.roots,model.byName,model.nodes end,
    isPartJoint=function(target) return target.Part0 ~= nil end,
}
local Authoring = (function()
-- INSERT_AUTHORING_HERE
end)()
local Preview = (function()
-- INSERT_PREVIEW_HERE
end)()
local MotionInspection = (function()
-- INSERT_INSPECTION_HERE
end)()
local function object(class, properties)
    local result=properties or {}; result.class=class
    function result:IsA(kind) return self.class == kind end
    function result:Destroy() self.destroyed=true end
    return result
end
local lastClone, clones = nil,0
local function makeModel()
    local model={Archivable=false,Parent="Workspace",pivot=CFrame.new(100,10,-50)}
    function model:GetPivot() return self.pivot end
    local root=object("BasePart",{CFrame=model.pivot*CFrame.new(0,3,0),Size=vector(2,2,1),Anchored=false})
    local body=object("BasePart",{CFrame=model.pivot*CFrame.new(0,3,0),Size=vector(2,2,1),Anchored=false})
    local foot=object("BasePart",{CFrame=model.pivot*CFrame.new(-.5,.5,0),Size=vector(1,1,2),Anchored=false})
    local rootNode={name="Root",object=root,children={}}
    local bodyNode={name="LowerTorso",object=body,parent=rootNode,children={},target={Part0=root,Part1=body,C0=CFrame.new(),C1=CFrame.new()}}
    local footNode={name="LeftFoot",object=foot,parent=bodyNode,children={},target={Part0=body,Part1=foot,C0=CFrame.new(-.5,-2.5,0),C1=CFrame.new()}}
    model.nodes={rootNode,bodyNode,footNode}; model.roots={rootNode}; model.byName={Root=rootNode,LowerTorso=bodyNode,LeftFoot=footNode}
    model.script=object("LuaSourceContainer"); model.effect=object("Beam",{Enabled=true})
    function model:GetDescendants() return {root,body,foot,self.script,self.effect} end
    function model:Clone() assert(self.Archivable); clones+=1; lastClone=makeModel(); lastClone.Parent=nil; return lastClone end
    function model:Destroy() self.destroyed=true end
    return model
end
local function near(actual,expected) assert(math.abs(actual-expected)<0.0001, tostring(actual).." ~= "..tostring(expected)) end
local source=makeModel()
local payload={assetId="asset",rigId="rig",jointMap={},times={0,.25,.5,.75,1},recipe={duration=1,loop=true,
    tracks={{joint="LowerTorso",keys={
        {time=0,position={0,0,0},rotation={0,0,0}},
        {time=.5,position={1,2,0},rotation={0,0,0}},
        {time=1,position={0,0,0},rotation={0,0,0}},
    }}},
}}
local result=MotionInspection.sample(source,payload)
assert(result.source=="studio_pose_evaluator" and result.groundSource=="rest_foot_bounds")
assert(#result.samples==5 and result.nodes[3].parent==2 and result.nodes[3].foot)
near(result.samples[1].bottoms[3],0); near(result.samples[3].bottoms[3],2)
near(result.samples[2].points[2][1],.5); near(result.samples[3].points[2][2],5)
near(result.samples[3].points[3][1],.5); near(result.samples[5].points[3][2],.5)
assert(lastClone.destroyed and lastClone.script.destroyed and not lastClone.effect.Enabled)
assert(lastClone.nodes[1].object.Anchored and not lastClone.nodes[1].object.CanCollide)
assert(source.Parent=="Workspace" and source.Archivable==false and not source.nodes[1].object.Anchored and not source.script.destroyed and source.effect.Enabled)
near(source.nodes[2].object.CFrame.Y,13)

-- Part joint offsets and untracked child transforms are evaluated parent first.
local nodes=makeModel().nodes
nodes[2].target.C0=CFrame.new(0,2,0); nodes[2].target.C1=CFrame.new(0,1,0)
Authoring.apply(nodes,{LowerTorso=payload.recipe.tracks[1]},.5)
near(nodes[2].object.CFrame.Y,16); near(nodes[3].object.CFrame.Y,13.5)
local bone={}
Authoring.apply({{name="Bone",target=bone}},{Bone=payload.recipe.tracks[1]},.5)
near(bone.Transform.X,1); near(bone.Transform.Y,2)

-- Rotated bounds use the part axes, not a fixed half-height.
local tilted=makeModel()
function tilted:Clone()
    lastClone=makeModel(); lastClone.Parent=nil
    local foot=lastClone.nodes[3].object
    foot.Size=vector(4,1,2); foot.CFrame=self.pivot*frame(-.5,.5,0,{0,-1,0,1,0,0,0,0,1})
    return lastClone
end
local rotated=MotionInspection.sample(tilted,payload)
near(rotated.samples[1].bottoms[3],1.5)

-- Errors restore Archivable and always destroy the detached clone.
local bad=makeModel()
function bad:Clone() error("clone failure") end
assert(not pcall(Preview.copy,bad) and bad.Archivable==false)
local badRecipe=table.clone(payload); badRecipe.jointMap={LowerTorso="missing"}
assert(not pcall(MotionInspection.sample,source,badRecipe) and lastClone.destroyed)
local before=clones; local badTimes=table.clone(payload); badTimes.times={0,.5,.5,1}
assert(not pcall(MotionInspection.sample,source,badTimes) and clones==before)
running=true
assert(not pcall(MotionInspection.sample,source,payload) and clones==before)
print("Motion inspection: shared joint evaluation, ground bounds, interpolation, source preservation and error cleanup passed")
