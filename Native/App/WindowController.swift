import AppKit
import WebKit

@MainActor final class WindowController: NSObject, NSWindowDelegate {
    let window: NotePanel
    let bridge: EditorBridge
    private let surface: GlassSurface
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
            if visible { self.loadView.showFailure(error) } else { self.loadView.isHidden = true }
        }
        bridge.window = window
        bridge.onHide = { [weak self] in await self?.hide() }
        bridge.onSettings = { [weak self] in self?.applySettings() }
        applySettings(); bridge.start()
        NSWorkspace.shared.notificationCenter.addObserver(self, selector: #selector(environmentChanged), name: NSWorkspace.accessibilityDisplayOptionsDidChangeNotification, object: nil)
        DistributedNotificationCenter.default().addObserver(self, selector: #selector(environmentChanged), name: Notification.Name("AppleInterfaceThemeChangedNotification"), object: nil)
    }
    @objc private func environmentChanged() { applySettings() }
    private func applySettings() {
        let settings = bridge.settings
        window.appearance = settings.theme == "system" ? nil : NSAppearance(named: settings.theme == "dark" ? .darkAqua : .aqua)
        window.level = settings.pinned ? .floating : .normal
        let dark = window.effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
        let solid = settings.reduceTransparency || NSWorkspace.shared.accessibilityDisplayShouldReduceTransparency
        surface.setSolid(solid, dark: dark)
        bridge.sendEnvironment(dark: dark, solid: solid)
    }
    func show(anchorProvider: @escaping () -> (rect: NSRect, screen: NSScreen)?) {
        visibility.shown()
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
        guard pendingPresentation || window.isVisible else { stopAnchorTracking(); return }
        guard !window.inLiveResize else { return }
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
        if pendingPresentation {
            pendingPresentation = false
            NSApp.activate(ignoringOtherApps: true); window.makeKeyAndOrderFront(nil)
            window.makeFirstResponder(bridge.webView); bridge.send(["type": "focusEditor"])
        }
    }
    private func stopAnchorTracking() {
        anchorTimer?.invalidate(); anchorTimer = nil; anchorProvider = nil
    }
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
        pendingPresentation = false
        await visibility.hide(flush: { [weak self] in await self?.prepareToHide() ?? false }, perform: {
            window.orderOut(nil); stopAnchorTracking()
        })
    }
    func windowDidEndLiveResize(_ notification: Notification) {
        bridge.rememberSize(window.frame.size); updateAnchor()
    }
    func windowDidResize(_ notification: Notification) {
        if let anchor = anchorProvider?()?.rect { surface.pointerX = WindowPlacement.pointerX(anchor: anchor, frame: window.frame) }
    }
    func windowShouldClose(_ sender: NSWindow) -> Bool { Task { await hide() }; return false }
    func windowDidResignKey(_ notification: Notification) {
        guard !bridge.settings.pinned, window.isVisible, window.attachedSheet == nil, !bridge.presentingSheet else { return }
        Task { await hide() }
    }
}
