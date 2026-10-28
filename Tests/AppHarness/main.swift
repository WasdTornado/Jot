import AppKit
import WebKit

@MainActor func descendants(_ view: NSView) -> [NSView] { [view] + view.subviews.flatMap { descendants($0) } }
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
