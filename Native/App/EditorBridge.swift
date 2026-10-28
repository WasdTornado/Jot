import AppKit
import WebKit
import UniformTypeIdentifiers
import ServiceManagement

// 在 WebKit 和输入法消费快捷键之前，统一正文与原生菜单的全选入口。
@MainActor final class NoteWebView: WKWebView {
    var onSelectAll: (() -> Void)?

    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        let modifiers = event.modifierFlags.intersection([.command, .shift, .control, .option])
        if event.type == .keyDown, modifiers == [.command], event.charactersIgnoringModifiers?.lowercased() == "a",
           let responder = window?.firstResponder as? NSView,
           responder === self || responder.isDescendant(of: self), let onSelectAll {
            onSelectAll()
            return true
        }
        return super.performKeyEquivalent(with: event)
    }
}

@MainActor final class EditorBridge: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    private(set) var webView: NoteWebView
    weak var window: NSWindow?
    var onCheckForUpdates: (() -> Void)?
    var onHide: (() async -> Void)?
    var onSettings: (() -> Void)?
    var onPreviewSkin: ((String?) -> Void)?
    var onPageNames: (([String: String]) -> Void)?
    private var pendingArchive: (token: String, archive: WorkspaceArchive)?
    var onHotKey: ((HotKeySettings) throws -> Void)?
    var hotKeyError: String?
    var appendShortcut = "菜单栏右键 → 新建无格式正文"
    private var appendPending = false
    private let hotKeyRecorder = HotKeyRecorder()
    private(set) var presentingSheet = false
    private(set) var settings: AppSettings
    private let preferenceKey: String
    private let repository: NoteRepository
    private var pending: [String: CheckedContinuation<Void, Error>] = [:]
    private var webReady = false
    private var editorInitialized = false
    private let startupTimeout: Duration
    private let resourceURL: URL
    var onLoadState: ((_ visible: Bool, _ error: String?) -> Void)?
    private var startupTask: Task<Void,Never>?
    private var loadGeneration = 0
    private var automaticRetries = 0
    private var requestGenerations: [String:Int] = [:]
    private(set) var loadFailure: String?


    init(repository: NoteRepository, startupTimeout: Duration = .seconds(8)) {
        self.startupTimeout = startupTimeout
        self.repository = repository
        preferenceKey = "workspaceSettings." + (ProcessInfo.processInfo.environment["TOT_NOTES_DATA_DIR"] ?? "production")
        if let data = UserDefaults.standard.data(forKey: preferenceKey), let value = try? JSONDecoder().decode(AppSettings.self, from: data), (try? value.validate()) != nil { settings = value }
        else { settings = AppSettings() }
        resourceURL = Bundle.main.resourceURL!
        let configuration = WKWebViewConfiguration()
        webView = NoteWebView(frame: .zero, configuration: configuration)
        super.init()
        webView.onSelectAll = { [weak self] in self?.selectAllText() }
        configuration.userContentController.add(self, name: "notes")
        webView.navigationDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
    }
    private func persistSettings() throws {
        try settings.validate()
        UserDefaults.standard.set(try JSONEncoder().encode(settings), forKey: preferenceKey)
    }
    func rememberSize(_ size: NSSize) {
        settings.windowWidth = max(360, min(900, Int(size.width.rounded())))
        settings.windowHeight = max(360, min(1000, Int(size.height.rounded())))
        do { try persistSettings(); send(["type": "nativeSettings", "settings": try json(settings)]) }
        catch { NSLog("窗口尺寸保存失败：%@", error.localizedDescription) }
    }
    func requestAppend() {
        if editorInitialized { send(["type": "requestAppend"]) } else { appendPending = true }
    }
    func start() { loadEditor(replacing: false) }
    private func loadEditor(replacing: Bool) {
        startupTask?.cancel(); loadGeneration += 1; requestGenerations.removeAll()
        webReady = false; editorInitialized = false; loadFailure = nil
        if replacing {
            let old = webView; let host = old.superview
            old.stopLoading(); old.navigationDelegate = nil; old.configuration.userContentController.removeScriptMessageHandler(forName:"notes")
            let configuration = WKWebViewConfiguration()
            let fresh = NoteWebView(frame:old.frame,configuration:configuration)
            fresh.onSelectAll = { [weak self] in self?.selectAllText() }
            fresh.autoresizingMask = old.autoresizingMask; fresh.setValue(false,forKey:"drawsBackground")
            fresh.navigationDelegate = self; configuration.userContentController.add(self,name:"notes")
            webView = fresh
            host?.addSubview(fresh,positioned:.below,relativeTo:old); old.removeFromSuperview()
        }
        onLoadState?(true,nil)
        let generation = loadGeneration
        startupTask = Task { [weak self] in
            try? await Task.sleep(for:self?.startupTimeout ?? .seconds(8))
            guard !Task.isCancelled, let self, self.loadGeneration == generation, !self.webReady else { return }
            self.startupFailed("编辑区启动超时。可以重新加载，无需退出应用。")
        }
        webView.loadFileURL(resourceURL.appendingPathComponent("index.html"), allowingReadAccessTo:resourceURL)
    }
    func editorDidInitialize() { editorInitialized = true }
    func retryEditorLoad() {
        // 正常运行或仍可编辑的网页不允许重载，防止清掉尚未保存的内存内容。
        guard loadFailure != nil, !editorInitialized else { return }
        automaticRetries = 0; loadEditor(replacing:true)
    }
    private func startupFailed(_ message: String) {
        guard !webReady, !editorInitialized else { return }
        startupTask?.cancel()
        if automaticRetries < 1 { automaticRetries += 1; loadEditor(replacing:true) }
        else { loadFailure = message; onLoadState?(true,message) }
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        guard webView === self.webView else { return }; startupFailed("编辑区加载失败：\(error.localizedDescription)")
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        guard webView === self.webView else { return }; startupFailed("编辑区加载失败：\(error.localizedDescription)")
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        guard webView === self.webView else { return }
        let hadEditor = editorInitialized
        startupTask?.cancel(); webReady = false; editorInitialized = false
        // 内容进程已经退出，不能再向旧进程等待保存回执，也不静默伪装为保存成功。
        let waiting = pending; pending.removeAll(); waiting.values.forEach { $0.resume(throwing:CocoaError(.fileWriteUnknown)) }
        if hadEditor {
            loadFailure = "编辑进程意外结束。已保存的内容仍在本机；尚未送达保存的输入可能需要补录。"
            onLoadState?(true,loadFailure)
        } else { startupFailed("编辑进程未能启动，请重新加载编辑区。") }
    }
    func send(_ message: [String: Any]) {
        guard webReady else { return }
        webView.callAsyncJavaScript("window.totNotes.receive(message)", arguments: ["message": message], in: nil, in: .page) { result in
            if case .failure(let error) = result { NSLog("便签消息失败：%@", error.localizedDescription) }
        }
    }
    func selectAllText() {
        guard webReady else { return }
        // 先接纳输入法尚未结束的文字，再建立全文选区；不能把组词状态当成拒绝全选的理由。
        if let client = window?.firstResponder as? NSTextInputClient, client.hasMarkedText() {
            client.unmarkText()
        }
        // 标准文字命令会收束 WebKit 的原生输入会话；下一帧再扩展为包含结构节点的选区。
        webView.perform(NSSelectorFromString("selectAll:"), with: nil)
        // WebKit 原生文字选区会漏掉首尾分隔线等节点，优先交给编辑器建立整篇选区。
        webView.callAsyncJavaScript("await new Promise(requestAnimationFrame); return window.totNotes.selectAll()", arguments: [:], in: nil, in: .page) { [weak self] result in
            if case .success(let value) = result, value as? Bool == true { return }
            self?.webView.perform(NSSelectorFromString("selectAll:"), with: nil)
        }
    }
    func flush() async throws {
        guard editorInitialized else { return }
        let id = UUID().uuidString
        try await withCheckedThrowingContinuation { continuation in
            pending[id] = continuation
            send(["type": "requestFlush", "requestID": id])
            Task {
                try? await Task.sleep(for: .seconds(3))
                if let waiting = pending.removeValue(forKey: id) { waiting.resume(throwing: CocoaError(.fileWriteUnknown)) }
            }
        }
    }
    func sendEnvironment(dark: Bool, solid: Bool) {
        send(["type": "environment", "dark": dark, "reduceTransparency": solid])
    }
    private func pageID(_ payload: Any?) throws -> String {
        guard let value = payload as? [String: Any], let id = value["pageID"] as? String,
              (1...7).map({ "page-\($0)" }).contains(id) else { throw NoteError.invalidDocument }
        return id
    }
    private func json<T: Encodable>(_ value: T) throws -> Any {
        try JSONSerialization.jsonObject(with: NoteSnapshot.encoder().encode(value))
    }
    private func reply(_ type: String, id: String, payload: Any = NSNull(), error: Error? = nil) {
        guard requestGenerations.removeValue(forKey:id) == loadGeneration else { return }
        var message: [String: Any] = ["type": type, "requestID": id, "ok": error == nil, "payload": payload]
        if let error { message["error"] = error.localizedDescription }
        send(message)
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.webView === webView, message.frameInfo.isMainFrame, let body = message.body as? [String: Any],
              let type = body["type"] as? String, let id = body["requestID"] as? String else { return }
        requestGenerations[id] = loadGeneration
        let requestGeneration = loadGeneration
        Task {
            // 已经收到的保存请求仍须落盘；只丢弃旧视图的控制请求和回执。
            guard requestGeneration == loadGeneration || type == "save" else { return }
            do {
                switch type {
            case "checkForUpdates": onCheckForUpdates?(); reply(type, id: id)
                case "ready":
                    webReady = true; startupTask?.cancel(); loadFailure = nil; onLoadState?(false,nil)
                    if let names = try await repository.storedPageNames() { settings.pageNames = names; try persistSettings() }
                    onPageNames?(settings.pageNames)
                    let loaded = try await repository.load(pageID: settings.pageID)
                    reply("load", id: id, payload: ["snapshot": try loaded.map { try json($0.snapshot) } ?? NSNull(), "recovered": loaded?.recovered ?? false, "settings": try json(settings), "hotKeyError": hotKeyError ?? "", "appendShortcut": appendShortcut])
                    onSettings?()
                case "editorReady":
                    editorDidInitialize(); reply("editorReadyResult", id: id)
                    if appendPending { appendPending = false; send(["type": "requestAppend"]) }
                case "loadPage":
                    let idPage = try pageID(body["payload"])
                    let loaded = try await repository.load(pageID: idPage)
                    reply("load", id: id, payload: ["snapshot": try loaded.map { try json($0.snapshot) } ?? NSNull(), "recovered": loaded?.recovered ?? false])
                case "listPages":
                    var pages: [[String: Any]] = []
                    for index in 1...7 {
                        let page = "page-\(index)"
                        do {
                            let loaded = try await repository.load(pageID: page)
                            pages.append(["pageID": page, "snapshot": try loaded.map { try json($0.snapshot) } ?? NSNull()])
                        } catch { pages.append(["pageID": page, "error": error.localizedDescription]) }
                    }
                    reply("pagesResult", id: id, payload: pages)
                case "checkpoint":
                    try await repository.checkpoint(pageID: pageID(body["payload"]))
                    reply("checkpointResult", id: id)
                case "loginStatus":
                    reply("loginStatusResult", id: id, payload: loginStatus())
                case "setLoginItem":
                    guard ProcessInfo.processInfo.environment["TOT_NOTES_DATA_DIR"] == nil,
                          let value = body["payload"] as? [String: Any], let enabled = value["enabled"] as? Bool else { throw NoteError.invalidDocument }
                    if enabled { try SMAppService.mainApp.register() } else { try await SMAppService.mainApp.unregister() }
                    reply("loginResult", id: id, payload: loginStatus())
                case "exportArchive":
                    let archive = try await repository.archive(pageNames: settings.pageNames)
                    let panel = NSSavePanel(); panel.allowedContentTypes = [.json]; panel.nameFieldStringValue = "Jot 完整备份.json"
                    guard let window, !presentingSheet else { throw NoteError.invalidDocument }
                    presentingSheet = true; defer { presentingSheet = false }
                    if await panel.beginSheetModal(for: window) == .OK, let url = panel.url {
                        try NoteSnapshot.encoder().encode(archive).write(to: url, options: .atomic)
                    }
                    reply("archiveExportResult", id: id)
                case "chooseArchive", "chooseRecoveryArchive":
                    let archive: WorkspaceArchive
                    if type == "chooseRecoveryArchive" { archive = try await repository.latestRecoveryArchive() }
                    else {
                        let panel = NSOpenPanel(); panel.allowedContentTypes = [.json]; panel.allowsMultipleSelection = false; panel.canChooseDirectories = false
                        panel.message = "选择 Jot 导出的完整备份，下一步预览内容。"
                        guard let window, !presentingSheet else { throw NoteError.invalidDocument }
                        presentingSheet = true; defer { presentingSheet = false }
                        guard await panel.beginSheetModal(for: window) == .OK, let url = panel.url else { reply("archivePreviewResult", id: id); return }
                        let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
                        guard size <= 20 * 1024 * 1024 else { throw NSError(domain: "TotNotes", code: 2, userInfo: [NSLocalizedDescriptionKey: "备份超过 20 MB，无法导入。"] ) }
                        archive = try WorkspaceArchive.decode(Data(contentsOf: url))
                    }
                    try archive.validate()
                    let token = UUID().uuidString; pendingArchive = (token, archive)
                    reply("archivePreviewResult", id: id, payload: ["token": token, "archive": try json(archive)])
                case "restoreArchive":
                    guard let payload = body["payload"] as? [String: Any], let token = payload["token"] as? String,
                          let pendingArchive, pendingArchive.token == token else { throw NoteError.invalidDocument }
                    let restored = try await repository.importArchive(pendingArchive.archive, currentNames: settings.pageNames)
                    settings.pageNames = restored.pageNames; try persistSettings(); onPageNames?(settings.pageNames)
                    self.pendingArchive = nil
                    reply("archiveRestoreResult", id: id, payload: try json(restored))
                case "discardArchive":
                    pendingArchive = nil; reply("discardArchiveResult", id: id)
                case "listHistory":
                    let entries = try await repository.history(pageID: pageID(body["payload"]))
                    reply("historyResult", id: id, payload: try json(entries))
                case "restoreHistory":
                    let page = try pageID(body["payload"])
                    guard let payload = body["payload"] as? [String: Any], let backupID = payload["backupID"] as? String,
                          let revision = payload["expectedRevision"] as? NSNumber else { throw NoteError.invalidDocument }
                    let restored = try await repository.restore(pageID: page, backupID: backupID, expectedRevision: revision.int64Value)
                    reply("restoreResult", id: id, payload: try json(restored))
                case "previewSkin":
                    guard let payload = body["payload"] as? [String: Any] else { throw NoteError.invalidDocument }
                    let skin = payload["skin"] as? String
                    guard skin == nil || AppSettings.skinIDs.contains(skin!) else { throw NoteError.invalidDocument }
                    onPreviewSkin?(skin); reply("previewSkinResult", id: id)
                case "setSettings":
                    let data = try JSONSerialization.data(withJSONObject: body["payload"] ?? NSNull())
                    var next = try JSONDecoder().decode(AppSettings.self, from: data)
                    // 尺寸与快捷键由原生确认后保存，网页旧请求不能覆盖它们。
                    next.windowWidth = settings.windowWidth; next.windowHeight = settings.windowHeight; next.hotKey = settings.hotKey
                    try next.validate()
                    if next.pageNames != settings.pageNames { try await repository.savePageNames(next.pageNames) }
                    settings = next; onPageNames?(next.pageNames)
                    try persistSettings()
                    onSettings?(); reply("settingsResult", id: id, payload: try json(settings))
                case "recordHotKey":
                    let key = await hotKeyRecorder.record { self.send(["type": "hotKeyRecording"]) }
                    reply("recordHotKeyResult", id: id, payload: try key.map { try json($0) } ?? NSNull())
                case "setHotKey":
                    let data = try JSONSerialization.data(withJSONObject: body["payload"] ?? NSNull())
                    let key = try JSONDecoder().decode(HotKeySettings.self, from: data)
                    guard let onHotKey else { throw NoteError.invalidDocument }
                    try onHotKey(key)
                    settings.hotKey = key; hotKeyError = nil; try persistSettings()
                    reply("hotKeyResult", id: id, payload: try json(settings))
                    send(["type": "shortcutInfo", "appendShortcut": appendShortcut])
                case "hide":
                    reply("hideResult", id: id); await onHide?()
                case "quit":
                    reply("quitResult", id: id); NSApp.terminate(nil)
                case "save":
                    let data = try JSONSerialization.data(withJSONObject: body["payload"] ?? NSNull())
                    let snapshot = try NoteSnapshot.decoder().decode(NoteSnapshot.self, from: data)
                    guard (1...7).map({ "page-\($0)" }).contains(snapshot.pageID) else { throw NoteError.invalidDocument }
                    let receipt = try await repository.save(snapshot)
                    reply("saveResult", id: id, payload: try json(receipt))
                case "flushResult":
                    requestGenerations.removeValue(forKey:id)
                    let waiting = pending.removeValue(forKey: id)
                    if body["ok"] as? Bool == true { waiting?.resume() }
                    else { waiting?.resume(throwing: CocoaError(.fileWriteUnknown)) }
                case "exportAll":
                    guard let payload = body["payload"] as? [String: Any], let raw = payload["files"] else { throw NoteError.invalidDocument }
                    let entries = try JSONDecoder().decode([MarkdownExportFile].self, from: JSONSerialization.data(withJSONObject: raw))
                    guard let window, !presentingSheet else { throw NoteError.invalidDocument }
                    let panel = NSOpenPanel(); panel.canChooseFiles = false; panel.canChooseDirectories = true
                    panel.canCreateDirectories = true; panel.allowsMultipleSelection = false; panel.prompt = "导出七页"
                    panel.message = "将在所选位置新建一个 Jot 文件夹，包含全部七页 Markdown。"
                    presentingSheet = true
                    let response = await panel.beginSheetModal(for: window)
                    presentingSheet = false
                    if response == .OK, let url = panel.url { _ = try MarkdownExport.write(entries, to: url) }
                    reply("exportAllResult", id: id)
                case "exportMarkdown":
                    guard let payload = body["payload"] as? [String: Any], let text = payload["text"] as? String else { throw NoteError.invalidDocument }
                    let panel = NSSavePanel(); panel.allowedContentTypes = [UTType(filenameExtension: "md") ?? .plainText]
                    let name = payload["name"] as? String ?? "便签.md"
                    guard MarkdownExport.validName(name) else { throw NoteError.invalidDocument }
                    panel.nameFieldStringValue = name
                    guard let window, !presentingSheet else { throw NoteError.invalidDocument }
                    presentingSheet = true
                    let response = await panel.beginSheetModal(for: window)
                    presentingSheet = false
                    if response == .OK, let url = panel.url { try text.write(to: url, atomically: true, encoding: .utf8) }
                    reply("exportResult", id: id)
                default: break
                }
            } catch { reply(type == "ready" ? "load" : type + "Result", id: id, error: error) }
        }
    }
    private func loginStatus() -> [String: Any] {
        if ProcessInfo.processInfo.environment["TOT_NOTES_DATA_DIR"] != nil { return ["enabled": false, "qa": true, "message": "隔离验收模式不修改系统开机启动项"] }
        let status = SMAppService.mainApp.status
        let message = status == .requiresApproval ? "请在系统设置 → 通用 → 登录项中允许 Jot 启动" : status == .notFound ? "当前应用位置不支持开机启动" : ""
        return ["enabled": status == .enabled || status == .requiresApproval, "message": message]
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if url.isFileURL && url.standardizedFileURL == resourceURL.appendingPathComponent("index.html").standardizedFileURL { decisionHandler(.allow) }
        else {
            if navigationAction.navigationType == .linkActivated && ["https", "http"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }
            decisionHandler(.cancel)
        }
    }
}
