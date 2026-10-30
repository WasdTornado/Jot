import AppKit
import WebKit

@MainActor final class WindowController: NSObject, NSWindowDelegate {
    let window: NotePanel
    let bridge: EditorBridge
    private var previewSkin: String?
    private let surface: GlassSurface
    private let dragHandle = WindowDragHandle(frame: .zero)
    private var dragRegion: CGRect?
    private var dragging = false
    private var dragControls: [CGRect] = []
    private var dragStartFrame = CGRect.zero
    private var dragTip = CGPoint.zero
    private var dragPointerX: CGFloat = 0
    private var pinnedBeforeFloating = false
    private var transitioning = false
    private var motionGeneration = 0
    private var motionTimer: Timer?
    private var tearTimer: Timer?
    private var overlay: WindowMotionOverlay?
    var onDockPulse: (() -> Void)?
    private var floatingFrame: CGRect?
    private let positionKey = "floatingPosition." + (ProcessInfo.processInfo.environment["TOT_NOTES_DATA_DIR"] ?? "production")
    private let loadView = EditorLoadView(frame:.zero)
    private let visibility = WindowVisibilityCoordinator()
    private var anchorProvider: (() -> (rect: NSRect, screen: NSScreen)?)?
    private var anchorTimer: Timer?
    private var pendingPresentation = false
    private var anchorDeadline = Date.distantPast
    private lazy var exitCoordinator = ExitCoordinator(flush: { [weak self] in
        guard let self else { throw NoteError.invalidDocument }
        try await self.bridge.flush()
    })
    override init() {
        let folder = ProcessInfo.processInfo.environment["TOT_NOTES_DATA_DIR"].map { URL(fileURLWithPath: $0) }
            ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("TotNotes")
        bridge = EditorBridge(repository: NoteRepository(directory: folder))
        window = NotePanel(contentRect: NSRect(x: 0, y: 0, width: 480, height: 478), styleMask: [.borderless, .resizable], backing: .buffered, defer: false)
        surface = GlassSurface(frame: NSRect(x: 0, y: 0, width: 480, height: 478))
        super.init()
        window.hidesOnDeactivate = false
        window.title = "Jot"; window.isOpaque = false; window.backgroundColor = .clear; window.hasShadow = true
        window.minSize = NSSize(width: 360, height: 360); window.maxSize = NSSize(width: 900, height: 1000)
        window.isReleasedWhenClosed = false; window.delegate = self
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        window.contentView = surface
        bridge.webView.frame = NSRect(x: 0, y: 0, width: 480, height: 468)
        bridge.webView.autoresizingMask = [.width, .height]; surface.addSubview(bridge.webView)
        loadView.frame = bridge.webView.frame; loadView.autoresizingMask = [.width,.height]; surface.addSubview(loadView)
        loadView.onRetry = { [weak self] in self?.bridge.retryEditorLoad() }
        bridge.onLoadState = { [weak self] visible,error in
            guard let self else { return }
            if visible {
                self.cancelMotion()
                self.dragHandle.isHidden = true; self.dragRegion = nil; self.previewSkin = nil
                self.applySettings(); self.loadView.showFailure(error)
            } else {
                // 网页可能先报告热区，再完成加载；恢复显示时必须重新布局原生把手。
                self.loadView.isHidden = true; self.layoutDragHandle()
            }
        }
        bridge.window = window
        bridge.onHide = { [weak self] in await self?.hide() }
        bridge.onSettings = { [weak self] in self?.applySettings() }
        bridge.onPreviewSkin = { [weak self] skin in self?.previewSkin = skin; self?.applySettings() }
        dragHandle.isHidden = true; surface.addSubview(dragHandle)
        bridge.onDragRegion = { [weak self] rect, controls in
            self?.dragRegion = rect; self?.dragControls = controls; self?.layoutDragHandle()
        }
        bridge.onWindowMode = { [weak self] in self?.floatingFrame != nil }
        bridge.onToggleWindowMode = { [weak self] in self?.toggleWindowMode() }
        dragHandle.onDragStart = { [weak self] in self?.beginDrag() }
        dragHandle.onDrag = { [weak self] in self?.moveDrag($0) }
        dragHandle.onDragEnd = { [weak self] in self?.endDrag() }
        dragHandle.onPlace = { [weak self] in self?.placeWindow($0) }
        dragHandle.onNudge = { [weak self] dx, dy in
            guard let self else { return }
            self.placeFloating(self.window.frame.offsetBy(dx: dx, dy: dy))
        }
        dragHandle.onReturnToEditor = { [weak self] in
            guard let self else { return }; self.window.makeFirstResponder(self.bridge.webView)
        }
        if let stored = UserDefaults.standard.string(forKey: positionKey) {
            floatingFrame = WindowPlacement.floating(frame: NSRectFromString(stored), screens: NSScreen.screens.map(\.visibleFrame))
        }
        pinnedBeforeFloating = UserDefaults.standard.bool(forKey: positionKey + ".pin")
        applySettings(); bridge.start()
        NSWorkspace.shared.notificationCenter.addObserver(self, selector: #selector(environmentChanged), name: NSWorkspace.accessibilityDisplayOptionsDidChangeNotification, object: nil)
        NSWorkspace.shared.notificationCenter.addObserver(self, selector: #selector(screensChanged), name: NSWorkspace.activeSpaceDidChangeNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(screensChanged), name: NSApplication.didChangeScreenParametersNotification, object: nil)
        DistributedNotificationCenter.default().addObserver(self, selector: #selector(environmentChanged), name: Notification.Name("AppleInterfaceThemeChangedNotification"), object: nil)
    }
    @objc private func environmentChanged() {
        if NSWorkspace.shared.accessibilityDisplayShouldReduceMotion { cancelMotion(); updateAnchor() }
        applySettings()
    }
    private func applySettings() {
        let settings = bridge.settings
        window.appearance = settings.theme == "system" ? nil : NSAppearance(named: settings.theme == "dark" ? .darkAqua : .aqua)
        window.level = settings.pinned ? .floating : .normal
        if !dragging && !transitioning && tearTimer == nil { surface.showsPointer = floatingFrame == nil }
        layoutDragHandle()
        let dark = window.effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
        let solid = settings.reduceTransparency || NSWorkspace.shared.accessibilityDisplayShouldReduceTransparency
        surface.setSolid(solid, dark: dark, skin: previewSkin ?? settings.skin, pageID: settings.pageID)
        bridge.sendEnvironment(dark: dark, solid: solid)
    }
    private var pendingUsageOpen = false
    func show(recordActivity: Bool = false, anchorProvider: @escaping () -> (rect: NSRect, screen: NSScreen)?) {
        visibility.shown()
        pendingUsageOpen = recordActivity
        self.anchorProvider = anchorProvider
        pendingPresentation = true; anchorDeadline = Date().addingTimeInterval(2)
        if anchorTimer == nil {
            // 图标会在首帧、应用激活、菜单栏排列或显示器变化时重新布局。
            // 仅在等待显示或窗口可见期间跟踪，收起后停止；不反复抢焦点。
            let timer = Timer(timeInterval: 0.1, repeats: true) { [weak self] _ in
                MainActor.assumeIsolated { self?.updateAnchor() }
            }
            anchorTimer = timer; RunLoop.main.add(timer, forMode: .common)
        }
        updateAnchor()
    }
    private func updateAnchor() {
        guard !dragging, !transitioning else { return }
        guard pendingPresentation || window.isVisible else { stopAnchorTracking(); return }
        guard !window.inLiveResize, window.attachedSheet == nil else { return }
        if let stored = floatingFrame {
            let desired = CGRect(origin: stored.origin, size: CGSize(width: bridge.settings.windowWidth, height: bridge.settings.windowHeight))
            if let frame = WindowPlacement.floating(frame: desired, screens: NSScreen.screens.map(\.visibleFrame)) {
                if window.frame != frame { window.setFrame(frame, display: true) }
                floatingFrame = frame; if tearTimer == nil { surface.showsPointer = false }
                presentIfNeeded(); return
            }
        }
        let snapshot = anchorProvider?()
        // 使用图标所属的显示器，不能从临时坐标猜测或退回当前主屏幕。
        let placement = snapshot.flatMap {
            WindowPlacement.frame(anchor: $0.rect, screen: $0.screen.frame, visible: $0.screen.visibleFrame, size: NSSize(width: bridge.settings.windowWidth, height: bridge.settings.windowHeight))
        }
        guard let snapshot, let frame = placement else {
            if pendingPresentation && Date() >= anchorDeadline {
                pendingPresentation = false
                if !window.isVisible { stopAnchorTracking() }
            }
            return
        }
        let anchor = snapshot.rect
        // 原生保存面板显示时保持其位置，面板关闭后再跟随图标。
        guard window.attachedSheet == nil else { return }
        if window.frame != frame {
            window.setFrame(frame, display: true)
            if ProcessInfo.processInfo.environment["TOT_NOTES_TRACE_PLACEMENT"] == "1" {
                NSLog("定位完成：图标 %@，窗口 %@", NSStringFromRect(anchor), NSStringFromRect(frame))
            }
        }
        surface.pointerX = WindowPlacement.pointerX(anchor: anchor, frame: frame)
        presentIfNeeded()
    }
    private func presentIfNeeded() {
        if pendingPresentation {
            pendingPresentation = false
            NSApp.activate(ignoringOtherApps: true); window.makeKeyAndOrderFront(nil)
            window.makeFirstResponder(bridge.webView); bridge.send(["type": "focusEditor"])
            if pendingUsageOpen { pendingUsageOpen = false; bridge.recordUsage() }
        }
    }
    private func stopAnchorTracking() {
        anchorTimer?.invalidate(); anchorTimer = nil
    }
    private func layoutDragHandle() {
        guard !transitioning, loadView.isHidden, let rect = dragRegion,
              rect.width >= 24, rect.height >= 20 else { dragHandle.isHidden = true; return }
        let web = bridge.webView
        let native = CGRect(x: web.frame.minX + rect.minX, y: web.frame.maxY - rect.maxY, width: rect.width, height: rect.height)
        dragHandle.frame = native.intersection(web.frame)
        let controls = dragControls.map { CGRect(x: $0.minX - rect.minX, y: rect.maxY - $0.maxY, width: $0.width, height: $0.height) }
        dragHandle.areas = WindowMotion.dragAreas(in: dragHandle.bounds, excluding: controls)
        dragHandle.isHidden = false; window.invalidateCursorRects(for: dragHandle)
    }
    private func placeFloating(_ requested: CGRect, persist: Bool = true) {
        guard let frame = WindowPlacement.floating(frame: requested, screens: NSScreen.screens.map(\.visibleFrame)) else { return }
        let changedMode = floatingFrame == nil
        if changedMode {
            pinnedBeforeFloating = bridge.settings.pinned
            UserDefaults.standard.set(pinnedBeforeFloating, forKey: positionKey + ".pin")
            floatingFrame = frame; bridge.setPinned(true)
        }
        floatingFrame = frame
        if tearTimer == nil { surface.showsPointer = false }
        window.setFrame(frame, display: true)
        if persist { UserDefaults.standard.set(NSStringFromRect(frame), forKey: positionKey) }
        if changedMode { sendWindowMode() }
    }
    private func placeWindow(_ placement: String) {
        guard !transitioning else { return }
        if placement == "anchor" { returnToAnchor(); return }
        guard let screen = window.screen ?? NSScreen.main,
              let frame = WindowPlacement.corner(placement, screen: screen.visibleFrame, size: window.frame.size) else { return }
        placeFloating(frame)
    }
    private func sendWindowMode() {
        bridge.send(["type": "windowMode", "floating": floatingFrame != nil, "busy": transitioning])
    }
    private func beginDrag() {
        guard !transitioning else { return }
        cancelMotion()
        dragging = true; dragStartFrame = window.frame
        dragPointerX = surface.pointerX ?? window.frame.width / 2
        dragTip = CGPoint(x: window.frame.minX + dragPointerX, y: window.frame.maxY)
        if floatingFrame == nil && !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion {
            surface.showsPointer = false
            overlay = WindowMotionOverlay(level: window.level)
        }
    }
    private func moveDrag(_ delta: CGPoint) {
        guard dragging else { return }
        let requested = dragStartFrame.offsetBy(dx: delta.x, dy: min(0, delta.y))
        if floatingFrame != nil {
            placeFloating(dragStartFrame.offsetBy(dx: delta.x, dy: delta.y), persist: false); return
        }
        window.setFrame(requested, display: true)
        overlay?.triangle(tip: dragTip, base: CGPoint(x: window.frame.minX + dragPointerX, y: window.frame.maxY - 11), halfWidth: 14, surface: surface)
        if WindowMotion.detached(delta) {
            placeFloating(window.frame); retractTriangle()
        }
    }
    private func endDrag() {
        guard dragging else { return }; dragging = false
        if floatingFrame != nil { placeFloating(window.frame); return }
        if NSWorkspace.shared.accessibilityDisplayShouldReduceMotion { cancelMotion(); updateAnchor(); return }
        let from = window.frame; transitioning = true; sendWindowMode(); layoutDragHandle()
        runMotion(duration: 0.52, frame: { [weak self] t in
            guard let self else { return }
            let spring = exp(-9 * t) * cos(9 * t)
            let x = self.dragStartFrame.minX + (from.minX - self.dragStartFrame.minX) * spring
            let y = self.dragStartFrame.minY + (from.minY - self.dragStartFrame.minY) * spring
            self.window.setFrameOrigin(CGPoint(x: x, y: y))
            self.overlay?.triangle(tip: self.dragTip, base: CGPoint(x: x + self.dragPointerX, y: self.window.frame.maxY - 11), halfWidth: 14, surface: self.surface)
        }, completion: { [weak self] in self?.cancelMotion(); self?.updateAnchor() })
    }
    private func retractTriangle() {
        guard !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion else { overlay?.close(); overlay = nil; surface.showsPointer = false; return }
        tearTimer?.invalidate(); let start = CACurrentMediaTime()
        surface.showsPointer = true; surface.pointerX = dragPointerX
        let timer = Timer(timeInterval: 1 / 120, repeats: true) { [weak self] timer in
            MainActor.assumeIsolated {
                guard let self else { timer.invalidate(); return }
                let t = min(1, (CACurrentMediaTime() - start) / 0.42)
                let remaining = CGFloat(pow(1 - t, 3))
                // 下半截直接画在便签自身的轮廓里，继续移动也不会和顶部脱离。
                self.surface.pointerHeight = 10 * remaining
                self.overlay?.triangle(tip: self.dragTip, base: CGPoint(x: self.dragTip.x, y: self.dragTip.y - 22 * remaining), halfWidth: 7 * remaining, surface: self.surface)
                if t >= 1 {
                    timer.invalidate(); self.tearTimer = nil
                    self.surface.showsPointer = false; self.surface.pointerHeight = 10
                    self.overlay?.close(); self.overlay = nil
                }
            }
        }
        tearTimer = timer; RunLoop.main.add(timer, forMode: .common)
    }
    private func toggleWindowMode() {
        guard !transitioning, !dragging, loadView.isHidden, window.attachedSheet == nil else { return }
        if floatingFrame != nil { returnToAnchor(); return }
        if NSWorkspace.shared.accessibilityDisplayShouldReduceMotion { placeFloating(window.frame.offsetBy(dx: 0, dy: -52)); return }
        beginDrag(); transitioning = true; sendWindowMode(); layoutDragHandle()
        runMotion(duration: 0.46, frame: { [weak self] t in
            self?.moveDrag(CGPoint(x: 0, y: -132 * (1 - pow(1 - t, 3))))
        }, completion: { [weak self] in
            guard let self else { return }
            self.transitioning = false; self.endDrag(); self.sendWindowMode(); self.layoutDragHandle()
        })
    }
    private func dock() {
        floatingFrame = nil; UserDefaults.standard.removeObject(forKey: positionKey)
        surface.showsPointer = true; surface.pointerHeight = 10
        bridge.setPinned(pinnedBeforeFloating); updateAnchor(); sendWindowMode()
    }
    private func returnToAnchor() {
        guard !transitioning, floatingFrame != nil, let anchor = anchorProvider?(),
              let home = WindowPlacement.frame(anchor: anchor.rect, screen: anchor.screen.frame, visible: anchor.screen.visibleFrame, size: window.frame.size) else { return }
        cancelMotion()
        if NSWorkspace.shared.accessibilityDisplayShouldReduceMotion { dock(); return }
        transitioning = true; sendWindowMode(); layoutDragHandle()
        let generation = motionGeneration
        let source = window.frame
        let config = WKSnapshotConfiguration(); config.rect = bridge.webView.bounds
        // 快照超时也能归位；迟到的回调不能重新显示已收起的窗口。
        runMotion(duration: 1.5, frame: { _ in }, completion: { [weak self] in self?.cancelMotion(); self?.dock() })
        bridge.webView.takeSnapshot(with: config) { [weak self] image, _ in
            guard let self, self.motionGeneration == generation, self.transitioning else { return }
            self.motionTimer?.invalidate(); self.motionTimer = nil
            guard let image, let snapshot = self.paperSnapshot(image) else { self.cancelMotion(); self.dock(); return }
            let overlay = WindowMotionOverlay(level: self.window.level); self.overlay = overlay
            let size = CGSize(width: source.width, height: source.height - 10)
            let from = CGRect(origin: source.origin, size: size)
            let to = CGRect(origin: home.origin, size: size)
            let target = CGPoint(x: anchor.rect.midX, y: anchor.rect.minY + 2)
            overlay.prepare(image: snapshot, size: size, surface: self.surface); overlay.genie(progress: 0, origin: from, target: target)
            self.window.alphaValue = 0; self.window.ignoresMouseEvents = true
            self.window.makeFirstResponder(self.dragHandle)
            var emerging = false
            self.runMotion(duration: 1.32, frame: { [weak self] progress in
                guard let self else { return }
                let elapsed = progress * 1.32
                if elapsed < 0.62 {
                    overlay.genie(progress: sin(elapsed / 0.62 * .pi / 2), origin: from, target: target)
                } else {
                    if !emerging { emerging = true; self.onDockPulse?() }
                    overlay.genie(progress: 1 - sin((elapsed - 0.62) / 0.70 * .pi / 2), origin: to, target: target)
                }
            }, completion: { [weak self] in
                guard let self else { return }
                // 先提交真实窗口的几何、模式与焦点，再渐退快照；不能同帧硬切两个合成窗口。
                self.transitioning = false; self.dock()
                self.transitioning = true; self.layoutDragHandle()
                self.window.makeFirstResponder(self.bridge.webView)
                self.bridge.send(["type": "focusEditor"])
                self.surface.layoutSubtreeIfNeeded(); self.window.displayIfNeeded()
                self.window.alphaValue = 1
                CATransaction.flush()
                self.runMotion(duration: 0.18, frame: { t in overlay.setOpacity(1 - t * t * (3 - 2 * t)) }, completion: { [weak self] in
                    self?.cancelMotion()
                })
            })
        }
    }
    private func paperSnapshot(_ image: NSImage) -> CGImage? {
        let size = bridge.webView.bounds.size; let scale = window.backingScaleFactor
        guard let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size.width * scale), pixelsHigh: Int(size.height * scale), bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0),
              let context = NSGraphicsContext(bitmapImageRep: bitmap) else { return nil }
        NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = context
        context.cgContext.scaleBy(x: scale, y: scale)
        let bounds = CGRect(origin: .zero, size: size)
        NSBezierPath(roundedRect: bounds, xRadius: 22, yRadius: 22).addClip()
        image.draw(in: bounds)
        NSGraphicsContext.restoreGraphicsState(); return bitmap.cgImage
    }
    private func runMotion(duration: Double, frame: @escaping (CGFloat) -> Void, completion: @escaping () -> Void) {
        motionTimer?.invalidate(); let start = CACurrentMediaTime()
        let timer = Timer(timeInterval: 1 / 120, repeats: true) { [weak self] timer in
            MainActor.assumeIsolated {
                guard let self else { timer.invalidate(); return }
                let t = min(1, (CACurrentMediaTime() - start) / duration)
                frame(CGFloat(t))
                if t >= 1 { timer.invalidate(); self.motionTimer = nil; completion() }
            }
        }
        motionTimer = timer; RunLoop.main.add(timer, forMode: .common)
    }
    private func cancelMotion() {
        motionGeneration += 1; motionTimer?.invalidate(); motionTimer = nil
        tearTimer?.invalidate(); tearTimer = nil
        // 先提交真实窗口，再撤销覆盖层，避免两个画面之间出现空帧。
        surface.layoutSubtreeIfNeeded(); window.displayIfNeeded()
        window.alphaValue = 1; window.ignoresMouseEvents = false
        CATransaction.flush()
        overlay?.close(); overlay = nil
        transitioning = false; dragging = false
        surface.pointerHeight = 10; surface.showsPointer = floatingFrame == nil
        layoutDragHandle(); sendWindowMode()
    }
    @objc private func screensChanged() { cancelMotion(); updateAnchor() }
    func exportNote() { bridge.send(["type": "requestExport"]) }
    func selectPage(_ index: Int) { bridge.send(["type": "selectPage", "index": index]) }
    func prepareToHide() async -> Bool {
        let success = await exitCoordinator.flushBeforeClosing()
        if !success {
            window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
            if window.attachedSheet == nil {
                let alert = NSAlert(); alert.messageText = "便签尚未保存"
                alert.informativeText = "本次操作已取消，内容仍在窗口中。请重试保存，或先导出 Markdown。"
                alert.addButton(withTitle: "保留窗口"); alert.beginSheetModal(for: window, completionHandler: { _ in })
            }
        }
        return success
    }
    func hide() async {
        cancelMotion()
        pendingPresentation = false
        await visibility.hide(flush: { [weak self] in await self?.prepareToHide() ?? false }, perform: {
            window.orderOut(nil); stopAnchorTracking()
        })
    }
    func windowDidEndLiveResize(_ notification: Notification) {
        bridge.rememberSize(window.frame.size)
        if floatingFrame != nil { placeFloating(window.frame) }; updateAnchor()
    }
    func windowDidResize(_ notification: Notification) {
        layoutDragHandle()
        if let anchor = anchorProvider?()?.rect { surface.pointerX = WindowPlacement.pointerX(anchor: anchor, frame: window.frame) }
    }
    func windowShouldClose(_ sender: NSWindow) -> Bool { Task { await hide() }; return false }
    func windowDidResignKey(_ notification: Notification) {
        guard !dragging, !transitioning, !bridge.settings.pinned, window.isVisible, window.attachedSheet == nil, !bridge.presentingSheet else { return }
        Task { await hide() }
    }
}
