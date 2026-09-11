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
local info = DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Right, false, false, 330, 600, 290, 420)
local widget = plugin:CreateDockWidgetPluginGuiAsync("RobloxMotionTools", info)
widget.Title = "Motion Tools"
local panel = Instance.new("ScrollingFrame")
panel.Size = UDim2.fromScale(1, 1)
panel.CanvasSize = UDim2.fromOffset(0, 610)
panel.ScrollBarThickness = 5
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
text("TextLabel", "Select a rig, then connect. Use npm run app to choose your AI.", 12, 48)
local connectButton = text("TextButton", "Connect", 72, 36)
local stopButton = text("TextButton", "Stop preview", 118, 32)
local replayButton = text("TextButton", "Replay last preview", 160, 32)
local libraryButton = text("TextButton", "View animations  v", 206, 36)
local refreshButton = text("TextButton", "Refresh animation library", 250, 30)
local dropdown = Instance.new("ScrollingFrame")
dropdown.Name = "AnimationDropdown"
dropdown.Position = UDim2.fromOffset(12, 246)
dropdown.Size = UDim2.new(1, -24, 0, 190)
dropdown.BackgroundColor3 = Color3.fromRGB(36, 40, 48)
dropdown.BorderSizePixel = 1
dropdown.ScrollBarThickness = 6
dropdown.ZIndex = 5
dropdown.Visible = false
dropdown.Parent = panel
local playSelectedButton = text("TextButton", "Play selected animation", 292, 36)
text("TextLabel", "Preview duration (seconds, up to 30)", 338, 24)
local secondsInput = text("TextBox", "10", 368, 30)
secondsInput.ClearTextOnFocus = false
local connectionLabel = text("TextLabel", "Disconnected", 410, 26)
local status = text("TextLabel", "Your saved animation library persists across sessions.", 446, 108)
text("TextLabel", "New AI connections: run npm run app in your Motion Tools folder.", 564, 36)
local lastPreview
local selectedAssetId = plugin:GetSetting("MotionSelectedAnimation")
local libraryBusy = false
local refreshLibrary
button.Click:Connect(function() widget.Enabled = not widget.Enabled end)
connectButton.MouseButton1Click:Connect(function()
    connected = not connected
    connectButton.Text = connected and "Disconnect" or "Connect"
    connectionLabel.Text = connected and "Connecting..." or "Disconnected"
    if not connected then Preview.stop(); dropdown.Visible = false; status.Text = "Disconnected"
    elseif refreshLibrary then task.spawn(refreshLibrary) end
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

refreshLibrary = function()
    if libraryBusy then return end
    libraryBusy = true
    local ok, err = pcall(function()
        assert(connected, "Connect Motion Tools to browse saved animations.")
        local assets, seen, offset = {}, {}, 0
        repeat
            local page = request("/library/list", { kind = "animation", offset = offset, limit = 100 })
            for _, asset in page.assets do
                if not seen[asset.id] then table.insert(assets, asset); seen[asset.id] = true end
            end
            offset = page.nextOffset
        until offset == nil
        if not alive or not connected then return end
        for _, child in dropdown:GetChildren() do child:Destroy() end
        local selected
        for index, asset in assets do
            local row = Instance.new("TextButton")
            row.Name = "Animation_" .. asset.id
            row.Size = UDim2.new(1, -8, 0, 44)
            row.Position = UDim2.fromOffset(0, (index - 1) * 46)
            row.BackgroundColor3 = Color3.fromRGB(48, 53, 64)
            row.TextColor3 = Color3.fromRGB(237, 239, 244)
            row.Font = Enum.Font.SourceSans
            row.TextSize = 15
            row.TextWrapped = true
            row.Text = asset.name .. "\n" .. string.sub(asset.createdAt, 1, 10) .. " / " .. string.sub(asset.id, 1, 6)
            row.ZIndex = 6
            row.Parent = dropdown
            row.MouseButton1Click:Connect(function()
                selectedAssetId = asset.id
                plugin:SetSetting("MotionSelectedAnimation", asset.id)
                libraryButton.Text = "View animations: " .. asset.name .. "  v"
                dropdown.Visible = false
                status.Text = "Selected: " .. asset.name .. ". Select the rig you want to preview."
            end)
            if asset.id == selectedAssetId then selected = asset end
        end
        if not selected and #assets > 0 then selected = assets[1]; selectedAssetId = selected.id end
        if not selected then selectedAssetId = nil end
        dropdown.CanvasSize = UDim2.fromOffset(0, #assets * 46)
        libraryButton.Text = selected and ("View animations: " .. selected.name .. "  v") or "View animations: no saved clips"
        refreshButton.Text = "Refresh library (" .. #assets .. " animations)"
    end)
    libraryBusy = false
    if not ok then status.Text = "Library unavailable: " .. tostring(err) end
end
libraryButton.MouseButton1Click:Connect(function()
    dropdown.Visible = not dropdown.Visible
    if dropdown.Visible then task.spawn(refreshLibrary) end
end)
refreshButton.MouseButton1Click:Connect(function() task.spawn(refreshLibrary) end)
playSelectedButton.MouseButton1Click:Connect(function()
    local ok, err = pcall(function()
        assert(connected, "Connect Motion Tools first.")
        assert(not RunService:IsRunning(), "Stop Play/Test mode before previewing.")
        assert(selectedAssetId, "Choose an animation from View animations first.")
        local snapshot = Rig.snapshot()
        assert(#snapshot.selection == 1, "Select exactly one rig in Workspace.")
        local rigId = snapshot.selection[1].id
        local asset = request("/library/read", { id = selectedAssetId })
        assert(alive and connected, "Disconnected while loading the animation.")
        assert(asset.recipe.kind == "animation", "This asset is not an animation.")
        local seconds = tonumber(secondsInput.Text)
        assert(seconds and seconds >= 0.1 and seconds <= 30, "Preview duration must be between 0.1 and 30 seconds.")
        local current = Rig.snapshot()
        assert(#current.selection == 1 and current.selection[1].id == rigId, "Selection changed while loading. Click Play again.")
        local payload = { rigId = rigId, animation = asset.recipe, jointMap = {}, seconds = seconds, effects = {} }
        Preview.start(Rig.resolve(rigId), payload)
        lastPreview = payload
        dropdown.Visible = false
        status.Text = "Playing: " .. asset.recipe.name .. "\nClick Play selected animation to restart it."
    end)
    if not ok then status.Text = tostring(err) end
end)

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
    if op == "capture_chunk" then return ReviewCapture.chunk(payload) end
    local model = Rig.resolve(payload.rigId)
    if op == "sample_animation" then return MotionInspection.sample(model, payload) end
    if op == "capture_frame" then return ReviewCapture.frame(model, payload) end
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
            if payload.recipe.column then
                return { saved = attachment.Name, kind = "Attachment", note = "3D column recipe saved in MotionColumnRecipe. Motion Tools can replay it; gameplay playback requires a separate runtime integration." }
            end
            return { saved = attachment.Name, kind = "Attachment", note = payload.recipe.beam and "Laser saved disabled. Enable its Beam children for the Duration attribute, then disable them." or "Emitter saved disabled. EmitCount attribute stores its burst count." }
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
                connectionLabel.Text = "Connected: " .. game.Name
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
            if not ok then connectionLabel.Text = "Connection needs attention"; status.Text = tostring(err) end
        end
        task.wait(connected and 0.75 or 1)
    end
end)
plugin.Unloading:Connect(function() alive = false; Preview.stop() end)
