import AppKit
import WebKit

@MainActor func descendants(_ view: NSView) -> [NSView] { [view] + view.subviews.flatMap { descendants($0) } }
@MainActor func checkSkinGlass() {
    let surface = GlassSurface(frame: NSRect(x: 0, y: 0, width: 480, height: 478))
    for skin in ["default", "grid", "cream", "marker", "mint", "sakura", "manuscript", "sea"] {
        for dark in [false, true] {
            surface.setSolid(false, dark: dark, skin: skin)
            guard !surface.material.isHidden,
                  let tintAlpha = surface.subviews.last?.layer?.backgroundColor?.alpha, tintAlpha < 0.5,
                  surface.layer?.backgroundColor?.alpha == 0 else {
                print("FAIL：\(skin) 深色=\(dark) 的毛玻璃被不透明层遮住"); exit(1)
            }
            surface.setSolid(true, dark: dark, skin: skin)
            guard surface.material.isHidden, surface.layer?.backgroundColor?.alpha == 1 else {
                print("FAIL：减少透明效果没有恢复实色纸张"); exit(1)
            }
        }
    }
    var colors = Set<String>()
    let copy = GlassSurface(frame: surface.frame)
    for page in 1...7 {
        surface.setSolid(false, dark: false, pageID: "page-\(page)")
        colors.insert(surface.paperColor.description)
        copy.copyAppearance(from: surface)
        assert(copy.paperColor == surface.paperColor, "拖拽覆盖层必须继承当前页的颜色")
    }
    assert(colors.count == 7, "默认皮肤七页必须具有不同的纸张染色")
    print("PASS：八种皮肤深浅模式均启用玻璃，减少透明效果恢复实色")
}
@MainActor func checkPointerSeam() {
    let surface = GlassSurface(frame: NSRect(x: 0, y: 0, width: 480, height: 478))
    for x in [80, 240, 400] {
        for height in [2, 5, 10] {
            surface.pointerX = CGFloat(x); surface.pointerHeight = CGFloat(height); surface.layout()
            let bitmap = NSBitmapImageRep(data: surface.material.maskImage!.tiffRepresentation!)!
            // 顶部 10 pt 是尖角区；接缝两侧应为连续不透明纸张。
            guard (10...11).allSatisfy({ bitmap.colorAt(x: x, y: $0)!.alphaComponent > 0.99 }) else {
                print("FAIL：三角尖角与纸张连接处出现透明缝"); exit(1)
            }
        }
    }
    print("PASS：不同位置和回缩高度下，尖角与纸张连续不透明")
}
@MainActor func checkMotionOverlays() {
    let overlay = WindowMotionOverlay(level: .floating)
    defer { overlay.close() }
    let panels = NSApp.windows.filter { $0.identifier?.rawValue == "JotMotion" }
    guard panels.count == NSScreen.screens.count,
          panels.allSatisfy({ panel in NSScreen.screens.contains { $0.frame == panel.frame } }) else {
        print("FAIL：动效图层没有逐屏覆盖，会被独立 Space 裁剪"); exit(1)
    }
    let paper = GlassSurface(frame: NSRect(x: 0, y: 0, width: 480, height: 478))
    paper.setSolid(false, dark: true, skin: "sea")
    overlay.triangle(tip: CGPoint(x: 400, y: 900), base: CGPoint(x: 410, y: 800), halfWidth: 14, surface: paper)
    guard panels.allSatisfy({ panel in
        descendants(panel.contentView!).contains { $0 is NSVisualEffectView }
    }) else { print("FAIL：拖拽连接使用实色填充，没有继承纸张毛玻璃"); exit(1) }
    let bitmap = CGContext(data: nil, width: 480, height: 468, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    bitmap.setFillColor(NSColor.red.cgColor); bitmap.fill(CGRect(x: 0, y: 0, width: 480, height: 468))
    overlay.prepare(image: bitmap.makeImage()!, size: CGSize(width: 480, height: 468), surface: paper)
    let origin = CGRect(x: 200, y: 100, width: 480, height: 468)
    overlay.genie(progress: 0, origin: origin, target: CGPoint(x: 400, y: 900))
    for panel in panels {
        guard let view = panel.contentView, view.isFlipped, let root = view.layer,
              root.bounds.size == panel.frame.size, let first = root.sublayers?.first(where: { $0.name == "JotPaperStrip" }),
              first.zPosition > (view.subviews.first?.layer?.zPosition ?? 0),
              abs(first.frame.minX - (origin.minX - panel.frame.minX)) < 0.01,
              abs(first.frame.minY - (panel.frame.maxY - origin.maxY)) < 0.01 else {
            print("FAIL：真实 AppKit 图层与便签坐标不一致"); exit(1)
        }
    }
    overlay.close()
    guard panels.allSatisfy({ !$0.isVisible }) else { print("FAIL：动画结束后残留覆盖层"); exit(1) }
    print("PASS：逐屏动画图层、真实纸张位置和清理行为正确")
}
@MainActor func checkSelectAllRouting(_ view: NoteWebView, in window: NSWindow) {
    let original = view.onSelectAll
    var calls = 0
    view.onSelectAll = { calls += 1 }
    defer { view.onSelectAll = original }
    guard window.makeFirstResponder(view) else { print("FAIL：不能建立正文原生焦点"); exit(1) }
    func key(_ modifiers: NSEvent.ModifierFlags) -> NSEvent {
        NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: modifiers, timestamp: 0,
                        windowNumber: window.windowNumber, context: nil, characters: "a",
                        charactersIgnoringModifiers: "a", isARepeat: false, keyCode: 0)!
    }
    guard view.performKeyEquivalent(with: key(.command)), calls == 1 else {
        print("FAIL：正文焦点下的 ⌘A 未进入全文选择入口"); exit(1)
    }
    _ = view.performKeyEquivalent(with: key([.command, .shift]))
    _ = view.performKeyEquivalent(with: key([.command, .option]))
    _ = view.performKeyEquivalent(with: key(.control))
    guard calls == 1 else { print("FAIL：误截获其他组合键"); exit(1) }
    // 原生对话框输入框的全选交给原来的响应链，不能改动便签正文。
    let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 100, height: 24))
    window.contentView?.addSubview(field)
    guard window.makeFirstResponder(field) else { print("FAIL：不能建立输入框焦点"); exit(1) }
    _ = view.performKeyEquivalent(with: key(.command))
    guard calls == 1 else { print("FAIL：原生输入框焦点被误当成正文"); exit(1) }
    window.makeFirstResponder(view); field.removeFromSuperview()
}
MainActor.assumeIsolated {
    NSApplication.shared.setActivationPolicy(.prohibited)
    checkSkinGlass()
    checkPointerSeam()
    checkMotionOverlays()
    let controller = WindowController()
    checkSelectAllRouting(controller.bridge.webView, in: controller.window)
    print("PASS：正文 ⌘A 使用统一入口，其他快捷键和原生输入框不被截获")
    for _ in 0..<2 {
        let delegate: WKNavigationDelegate = controller.bridge
        delegate.webView?(controller.bridge.webView, didFailProvisionalNavigation: nil, withError: URLError(.cannotOpenFile))
    }
    let retry = descendants(controller.window.contentView!).compactMap { $0 as? NSButton }.first { $0.title == "重新加载编辑区" && !$0.isHidden }
    guard retry != nil else { print("FAIL：网页加载失败后没有原生恢复入口，编辑区会保持空白"); exit(1) }
    print("PASS：网页加载失败有原生恢复入口")
    let failedView = controller.bridge.webView
    controller.bridge.retryEditorLoad()
    guard controller.bridge.webView !== failedView, controller.bridge.loadFailure == nil else { print("FAIL：重试没有重建失效视图"); exit(1) }
    let activeView = controller.bridge.webView
    checkSelectAllRouting(activeView, in: controller.window)
    print("PASS：重建编辑区后仍保留全选快捷键入口")
    controller.bridge.editorDidInitialize()
    controller.bridge.retryEditorLoad()
    guard controller.bridge.webView === activeView else { print("FAIL：正常编辑中的视图被重载"); exit(1) }
    controller.bridge.webViewWebContentProcessDidTerminate(activeView)
    guard controller.bridge.loadFailure?.contains("尚未送达保存") == true else { print("FAIL：进程退出后缺少恢复说明"); exit(1) }
    controller.bridge.retryEditorLoad()
    guard controller.bridge.webView !== activeView, controller.bridge.loadFailure == nil else { print("FAIL：内容进程退出后不能恢复"); exit(1) }
    print("PASS：重试重建视图、正常编辑禁止重载、内容进程退出后可恢复")
    // 真实运行超时任务；空 HTML 没有网页握手，不能永远停在加载状态。
    let folder = URL(fileURLWithPath: ProcessInfo.processInfo.environment["TOT_NOTES_DATA_DIR"]!)
    let stalled = EditorBridge(repository: NoteRepository(directory:folder),startupTimeout:.milliseconds(30))
    stalled.start()
    // WebKit 启动与主执行器调度可能超过固定 200ms；等待实际失败状态，并保留明确上限。
    let timeoutDeadline = Date().addingTimeInterval(3)
    while stalled.loadFailure == nil && Date() < timeoutDeadline {
        RunLoop.main.run(until: Date().addingTimeInterval(0.05))
    }
    guard stalled.loadFailure != nil else { print("FAIL：启动超时仍无恢复状态"); exit(1) }
    print("PASS：启动超时自动重试有上限，最终提供恢复状态")
    exit(0)
}
