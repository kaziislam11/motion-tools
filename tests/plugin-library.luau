-- UI behavior fixture. No Roblox place, API account, or real network is used.
local function event()
    local listeners = {}
    return { Connect = function(_, callback) table.insert(listeners, callback) end,
        Fire = function(_, ...) for _, callback in listeners do callback(...) end end }
end
local instances = {}
local Instance = {}
function Instance.new(class)
    local object = { ClassName = class, children = {}, MouseButton1Click = event(), Click = event() }
    function object:GetChildren() return table.clone(self.children) end
    function object:Destroy()
        if self.Parent then
            local index = table.find(self.Parent.children, self)
            if index then table.remove(self.Parent.children, index) end
        end
    end
    setmetatable(object, { __newindex = function(self, name, value)
        rawset(self, name, value)
        if name == "Parent" and value then table.insert(value.children, self) end
    end })
    table.insert(instances, object)
    return object
end
local UDim2 = { new = function(...) return {...} end, fromOffset = function(...) return {...} end, fromScale = function(...) return {...} end }
local Color3 = { fromRGB = function(...) return {...} end }
local Enum = { InitialDockState = { Right = "Right" }, Font = { SourceSans = "SourceSans" }, FinishRecordingOperation = {} }
local DockWidgetPluginGuiInfo = { new = function(...) return {...} end }
local plugin = { Unloading = event(), settings = {} }
function plugin:GetSetting(key) return self.settings[key] end
function plugin:SetSetting(key, value) self.settings[key] = value end
function plugin:CreateToolbar()
    return { CreateButton = function() return Instance.new("ToolbarButton") end }
end
function plugin:CreateDockWidgetPluginGuiAsync() return Instance.new("DockWidgetPluginGui") end
local task = {
    spawn = function(callback) local thread = coroutine.create(callback); assert(coroutine.resume(thread)); return thread end,
    wait = function() coroutine.yield() end,
}
local selection = { { id = "rig-a", name = "First rig" } }
local previews, stops, requests = {}, 0, {}
local changeDuringRead = false
local Rig = { snapshot = function() return { selection = selection } end, resolve = function(id) return { id = id } end }
local Preview = { start = function(model, payload) table.insert(previews, { model = model, payload = payload }); return { previewed = true } end, stop = function() stops += 1 end }
local Authoring, ReviewCapture = {}, {}
local clips = {}
for i = 1, 101 do table.insert(clips, { id = "clip-" .. i, name = "Same clip name", createdAt = "2026-09-11", kind = "animation" }) end
local encoded = {}
local HttpService = { GenerateGUID = function() return "fixture-session" end,
    JSONEncode = function(_, value) local key = "fixture-json-" .. (#encoded + 1); table.insert(encoded, value); return key end,
    JSONDecode = function(_, value) return encoded[tonumber(string.match(value, "%d+$"))] end }
function HttpService:RequestAsync(input)
    table.insert(requests, input)
    local body = self:JSONDecode(input.Body)
    local result
    if string.find(input.Url, "/library/list", 1, true) then
        assert(body.kind == "animation", "Dropdown must request only animations")
        result = { assets = {}, nextOffset = body.offset == 0 and 100 or nil }
        for i = body.offset + 1, math.min(body.offset + 100, #clips) do table.insert(result.assets, clips[i]) end
    elseif string.find(input.Url, "/library/read", 1, true) then
        result = { id = body.id, recipe = { kind = "animation", name = body.id } }
        if changeDuringRead then selection = { { id = "changed-rig", name = "Changed" } } end
    else error("Unexpected fixture endpoint") end
    return { Success = true, StatusCode = 200, Body = self:JSONEncode(result) }
end
local game = { Name = "Plugin fixture", GetService = function(_, name)
    if name == "HttpService" then return HttpService end
    if name == "RunService" then return { IsRunning = function() return false end } end
    return {}
end }

local function boot()
-- INSERT_PLUGIN_HERE
end
boot()
local function control(text)
    for _, item in instances do if item.Text == text then return item end end
    error("Missing control: " .. text)
end
control("Connect").MouseButton1Click:Fire()
local dropdown
for _, item in instances do if item.Name == "AnimationDropdown" then dropdown = item end end
local panelError = ""
for _, item in instances do if item.ClassName == "TextLabel" and item.Text then panelError ..= item.Text .. " / " end end
assert(dropdown and #dropdown:GetChildren() == 101, "Must load every page, including older clips: " .. panelError)
dropdown:GetChildren()[101].MouseButton1Click:Fire()
assert(plugin.settings.MotionSelectedAnimation == "clip-101", "Selection must persist by ID, not name")
selection = { { id = "rig-b", name = "Second rig" } }
control("Play selected animation").MouseButton1Click:Fire()
assert(#previews == 1 and previews[1].model.id == "rig-b", "Old clip must play on the currently selected rig")
assert(previews[1].payload.animation.name == "clip-101" and previews[1].payload.seconds == 10)
control("Refresh library (101 animations)").MouseButton1Click:Fire()
control("Play selected animation").MouseButton1Click:Fire()
assert(#previews == 2 and previews[2].payload.animation.name == "clip-101", "Refresh must retain the chosen revision")
control("Replay last preview").MouseButton1Click:Fire()
assert(#previews == 3 and previews[3].payload.animation.name == "clip-101")
control("10").Text = "31"
control("Play selected animation").MouseButton1Click:Fire()
assert(#previews == 3, "Out-of-range playback duration must not start a preview")
control("31").Text = "10"
changeDuringRead = true
control("Play selected animation").MouseButton1Click:Fire()
assert(#previews == 3, "Selection changing during the HTTP request must not animate the wrong rig")
changeDuringRead = false
selection = {}
control("Play selected animation").MouseButton1Click:Fire()
assert(#previews == 3, "Empty selection must not replay on a stale rig")
control("Disconnect").MouseButton1Click:Fire()
assert(stops > 0 and dropdown.Visible == false)
print("Animation dropdown: 101 clips, duplicate names, persistent selection, current rig, replay, duration and selection-race checks passed")
