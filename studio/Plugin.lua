local HttpService = game:GetService("HttpService")
local ChangeHistoryService = game:GetService("ChangeHistoryService")
local RunService = game:GetService("RunService")
local BASE = "__BRIDGE_URL__"
local TOKEN = "__BRIDGE_TOKEN__"
local sessionId = HttpService:GenerateGUID(false)
local connected, alive = false, true
local toolbar = plugin:CreateToolbar("Motion Tools")
local button = toolbar:CreateButton("MotionTools", "Connect animation, rigging, and VFX tools", "rbxasset://textures/sparkle.png", "Motion Tools")
button.ClickableWhenViewportHidden = true
local info = DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Right, false, false, 310, 310, 270, 290)
local widget = plugin:CreateDockWidgetPluginGuiAsync("RobloxMotionTools", info)
widget.Title = "Motion Tools"
local panel = Instance.new("Frame")
panel.Size = UDim2.fromScale(1, 1)
panel.BackgroundColor3 = Color3.fromRGB(30, 32, 38)
panel.Parent = widget
local function text(class, value, y, height)
    local control = Instance.new(class)
    control.Size = UDim2.new(1, -24, 0, height)
    control.Position = UDim2.fromOffset(12, y)
    control.BackgroundColor3 = Color3.fromRGB(48, 53, 64)
    control.TextColor3 = Color3.fromRGB(237, 239, 244)
    control.Font = Enum.Font.SourceSans
    control.TextSize = 16
    control.TextWrapped = true
    control.Text = value
    control.Parent = panel
    return control
end
text("TextLabel", "Select a rig, connect, then author through your AI chat.", 12, 48)
local connectButton = text("TextButton", "Connect", 72, 36)
local stopButton = text("TextButton", "Stop preview", 118, 32)
local replayButton = text("TextButton", "Replay last preview", 160, 32)
local status = text("TextLabel", "Disconnected", 202, 76)
local lastPreview
button.Click:Connect(function() widget.Enabled = not widget.Enabled end)
connectButton.MouseButton1Click:Connect(function()
    connected = not connected
    connectButton.Text = connected and "Disconnect" or "Connect"
    if not connected then Preview.stop(); status.Text = "Disconnected" end
end)
stopButton.MouseButton1Click:Connect(Preview.stop)
replayButton.MouseButton1Click:Connect(function()
    if not lastPreview then status.Text = "Ask your AI chat to preview an animation first."; return end
    local ok, result = pcall(function()
        return Preview.start(Rig.resolve(lastPreview.rigId), lastPreview)
    end)
    status.Text = ok and "Replaying animation and effects" or tostring(result)
end)

local function request(path, payload)
    local response = HttpService:RequestAsync({ Url = BASE .. path, Method = "POST", Headers = { ["Content-Type"] = "application/json", Authorization = "Bearer " .. TOKEN }, Body = HttpService:JSONEncode(payload) })
    assert(response.Success, "Bridge HTTP " .. response.StatusCode .. ": " .. response.Body)
    return HttpService:JSONDecode(response.Body)
end

local function recording(name, callback)
    local id = ChangeHistoryService:TryBeginRecording("MotionTools", name)
    assert(id, "Studio cannot begin an undo recording. Finish the current edit first.")
    local ok, result = pcall(callback)
    ChangeHistoryService:FinishRecording(id, ok and Enum.FinishRecordingOperation.Commit or Enum.FinishRecordingOperation.Cancel)
    assert(ok, result)
    return result
end

local function execute(command)
    assert(not RunService:IsRunning(), "Stop Play/Test mode before using Motion Tools.")
    local op, payload = command.operation, command.payload
    if op == "stop_preview" then return Preview.stop() end
    local model = Rig.resolve(payload.rigId)
    if op == "inspect" then return Rig.inspect(model) end
    if op == "preview" then
        local result = Preview.start(model, payload)
        lastPreview = payload
        return result
    end
    return recording("Motion Tools: " .. op, function()
        if op == "connect_parts" then return Rig.connect(model, payload) end
        if op == "save_animation" then
            local sequence = Authoring.sequence(model, payload.recipe, payload.jointMap or {})
            sequence:SetAttribute("MotionAssetId", payload.assetId)
            sequence.Parent = Authoring.saveDestination(model)
            return { saved = sequence.Name, kind = "KeyframeSequence", assetId = payload.assetId, note = "Local editable sequence. Publish using Roblox's Animation Editor when ready." }
        end
        if op == "save_vfx" then
            local attachment = Authoring.effect(Rig.part(model, payload.part), payload.recipe, false)
            attachment:SetAttribute("MotionAssetId", payload.assetId)
            return { saved = attachment.Name, kind = "Attachment", note = "Emitter saved disabled. EmitCount attribute stores its burst count." }
        end
        error("Unsupported operation: " .. tostring(op))
    end)
end

local pendingResult
task.spawn(function()
    while alive do
        if connected then
            local ok, err = pcall(function()
                if pendingResult then request("/result", pendingResult); pendingResult = nil end
                local response = request("/poll", { sessionId = sessionId, snapshot = Rig.snapshot() })
                status.Text = "Connected\n" .. game.Name
                local command = response.command
                if command then
                    -- Commands are delivered once. Only acknowledgements are retried.
                    local success, result = pcall(execute, command)
                    pendingResult = { sessionId = sessionId, id = command.id, ok = success, result = success and result or { error = tostring(result) } }
                    request("/result", pendingResult)
                    pendingResult = nil
                    status.Text = success and "Completed: " .. command.operation or tostring(result)
                end
            end)
            if not ok then status.Text = "Connection needs attention:\n" .. tostring(err) end
        end
        task.wait(connected and 0.75 or 1)
    end
end)
plugin.Unloading:Connect(function() alive = false; Preview.stop() end)
