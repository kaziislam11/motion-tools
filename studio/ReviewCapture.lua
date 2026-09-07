local ReviewCapture = {}
local captures = {}
local HttpService = game:GetService("HttpService")

function ReviewCapture.frame(model, payload)
    local service = game:GetService("StudioCaptureService")
    assert(service:RequestScreenshotPermissionAsync(), "Studio screenshot permission was not granted.")
    assert(service:CanCaptureScreenshot(), "Studio cannot capture the viewport right now.")
    local camera = workspace.CurrentCamera
    assert(camera, "No active viewport camera.")
    local previous = { kind = camera.CameraType, frame = camera.CFrame, focus = camera.Focus }
    local ownedFrame
    local ownedClone
    local stage
    local ok, result = pcall(function()
        Preview.start(model, { animation = payload.recipe, jointMap = payload.jointMap, effects = {}, seconds = 30, sampleTime = payload.time })
        local clone = Preview.model()
        ownedClone = clone
        clone:PivotTo(CFrame.new(0, 10000, 0))
        task.wait(0.1)
        local bounds, size = clone:GetBoundingBox()
        stage = Instance.new("Part")
        stage.Name = "MotionReviewGround"
        stage.Anchored, stage.CanCollide, stage.CanQuery, stage.CanTouch = true, false, false, false
        stage.Size = Vector3.new(100, 1, 100)
        stage.Color = Color3.fromRGB(75, 78, 85)
        stage.Position = bounds.Position - Vector3.new(0, size.Y / 2 + 0.5, 0)
        stage.Parent = clone
        local distance = math.max(size.X, size.Y, size.Z) * 2.1
        local direction = payload.view == "side" and Vector3.new(1, 0, 0) or Vector3.new(0, 0, -1)
        ownedFrame = CFrame.lookAt(bounds.Position + direction * distance, bounds.Position)
        camera.CameraType = Enum.CameraType.Scriptable
        camera.CFrame = ownedFrame
        camera.Focus = CFrame.new(bounds.Position)
        task.wait(0.1)
        local viewport = camera.ViewportSize
        assert(viewport.X > 0 and viewport.Y > 0, "Viewport has no drawable area.")
        local width = math.min(viewport.X, viewport.Y * 16 / 9)
        local crop = Vector2.new(math.floor(width), math.floor(width * 9 / 16))
        local screenshot = service:CaptureScreenshot({
            Position = Vector2.new(math.floor((viewport.X - crop.X) / 2), math.floor((viewport.Y - crop.Y) / 2)),
            CaptureSize = crop, OutputSize = Vector2.new(960, 540),
            ResampleMode = Enum.ResamplerMode.Default,
            Format = Enum.StudioCaptureScreenshotFormat.PNG, UICaptureMode = Enum.UICaptureMode.None,
        })
        local deadline = os.clock() + 10
        while screenshot.BufferStatus.Name ~= "Ready" do
            assert(Preview.model() == clone and clone.Parent, "Review capture cancelled.")
            assert(workspace.CurrentCamera == camera and camera.CFrame == ownedFrame, "Camera changed during capture.")
            assert(screenshot.BufferStatus.Name ~= "Error", "Studio screenshot failed: " .. tostring(screenshot:GetErrors()))
            assert(os.clock() < deadline, "Studio screenshot timed out.")
            task.wait(0.05)
        end
        local bytes = buffer.tostring(screenshot:GetBuffer())
        assert(#bytes <= 2 * 1024 * 1024, "Capture exceeds 2 MB limit.")
        assert(string.sub(bytes, 1, 8) == "\137PNG\13\10\26\10", "Capture did not return PNG bytes.")
        -- Keep only the latest image; clients must finish downloading before capturing another.
        captures = {}
        local id = HttpService:GenerateGUID(false)
        captures[id] = { bytes = bytes, expires = os.clock() + 180 }
        return { captureId = id, assetId = payload.assetId, rigId = payload.rigId, time = payload.time, view = payload.view, byteCount = #bytes, chunks = math.ceil(#bytes / 32768), width = 960, height = 540, note = "Unreviewed viewport capture. Retrieve hex chunks locally; inspect image before provider review." }
    end)
    if workspace.CurrentCamera == camera and ownedFrame and camera.CFrame == ownedFrame then
        camera.CameraType, camera.CFrame, camera.Focus = previous.kind, previous.frame, previous.focus
    end
    if ownedClone and Preview.model() == ownedClone then Preview.stop() end
    assert(ok, result)
    return result
end

function ReviewCapture.chunk(payload)
    local capture = captures[payload.captureId]
    assert(capture and os.clock() < capture.expires, "Capture expired or was replaced. Capture again.")
    local first = payload.index * 32768 + 1
    assert(first <= #capture.bytes, "Capture chunk index out of range.")
    local bytes = string.sub(capture.bytes, first, first + 32767)
    return { captureId = payload.captureId, index = payload.index, hex = (bytes:gsub(".", function(c) return string.format("%02x", string.byte(c)) end)) }
end

return ReviewCapture
