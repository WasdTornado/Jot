import AppKit
import Carbon

@MainActor final class AppDelegate: NSObject, NSApplicationDelegate {
    private var controller: WindowController!
    private var statusItem: NSStatusItem!
    private let hotKeyBinding = HotKeyRegistration<EventHotKeyRef>(register: { key in
        var reference: EventHotKeyRef?
        // 使用独占注册检测其他应用占用，避免非独占注册静默失效。
        let result = RegisterEventHotKey(key.keyCode, key.modifiers, EventHotKeyID(signature: 0x544E4F54, id: 1), GetApplicationEventTarget(), UInt32(kEventHotKeyExclusive), &reference)
        guard result == noErr, let reference else {
            throw NSError(domain: "TotNotes.HotKey", code: Int(result), userInfo: [NSLocalizedDescriptionKey: "此快捷键已被占用或不可用，原快捷键保持不变。"])
        }
        return reference
    }, unregister: { UnregisterEventHotKey($0) })
    private let appendBinding = HotKeyRegistration<EventHotKeyRef>(register: { key in
        var reference: EventHotKeyRef?
        let result = RegisterEventHotKey(key.keyCode, key.modifiers, EventHotKeyID(signature: 0x544E4F54, id: 2), GetApplicationEventTarget(), UInt32(kEventHotKeyExclusive), &reference)
        guard result == noErr, let reference else { throw CocoaError(.featureUnsupported) }
        return reference
    }, unregister: { UnregisterEventHotKey($0) })
    private var pageMenuItems: [NSMenuItem] = []
    private var eventHandler: EventHandlerRef?
    private var updater: AppUpdater!
    private var terminationPending = false
    private var terminationApproved = false
    func applicationDidFinishLaunching(_ notification: Notification) {
        controller = WindowController()
        updater = AppUpdater(prepare: { [weak self] in
            guard let self else { return false }
            return await self.controller.prepareToHide()
        })
        controller.bridge.onCheckForUpdates = { [weak self] in self?.updater.checkForUpdates(nil) }
        buildMenu()
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let button = statusItem.button {
            button.image = StatusIcon.make()
            button.image?.isTemplate = true; button.toolTip = "Jot · ⌃⌥空格"
            button.sendAction(on: [.leftMouseUp, .rightMouseUp])
            button.target = self; button.action = #selector(toggleNote)
        }
        controller.bridge.onHotKey = { [weak self] key in
            guard let self else { throw NoteError.invalidDocument }
            // 用户可以把旧的追加组合键改作普通呼出键；失败时还原旧的追加注册。
            let previousAppend = self.appendBinding.current
            self.appendBinding.dispose()
            do { try self.hotKeyBinding.apply(key) }
            catch {
                if let previousAppend { try? self.appendBinding.apply(previousAppend) }
                throw error
            }
            self.statusItem.button?.toolTip = "Jot · " + key.label + " · 右键打开操作菜单"
            self.controller.bridge.appendShortcut = "菜单栏右键 → 新建无格式正文"
            if key.modifiers & UInt32(shiftKey) == 0 {
                var append = key; append.modifiers |= UInt32(shiftKey); append.label = "⇧" + key.label
                if (try? self.appendBinding.apply(append)) != nil { self.controller.bridge.appendShortcut = append.label + " 新建无格式正文" }
            }
        }
        controller.bridge.onPageNames = { [weak self] names in
            let ids = ["page-2", "page-3", "page-1", "page-4", "page-5", "page-6", "page-7"]
            let defaults = ["灵感", "工作", "日常", "阅读", "草稿", "随想", "生活"]
            for (index, item) in (self?.pageMenuItems ?? []).enumerated() { item.title = names[ids[index]] ?? defaults[index] }
        }
        registerHotKey(); showNote()
    }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if terminationApproved { return .terminateNow }
        guard !terminationPending else { return .terminateCancel }
        terminationPending = true
        // 网页按钮在主执行器任务中触发退出；terminateLater 的嵌套事件循环会阻塞保存任务。
        // 先取消本轮退出，保持事件循环运行，确认写盘后再执行一次立即退出。
        Task {
            let saved = await controller.prepareToHide()
            terminationPending = false
            guard saved else { return }
            terminationApproved = true
            sender.terminate(nil)
        }
        return .terminateCancel
    }
    func applicationWillTerminate(_ notification: Notification) {
        hotKeyBinding.dispose(); appendBinding.dispose()
        if let eventHandler { RemoveEventHandler(eventHandler) }
    }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows: Bool) -> Bool { showNote(); return true }
    @objc private func toggleNote() {
        if NSApp.currentEvent?.type == .rightMouseUp {
            let menu = NSMenu()
            for (title, action) in [("打开便签", #selector(showNote)), ("新建无格式正文", #selector(appendNote)), ("退出 Jot", #selector(NSApplication.terminate(_:)))] {
                let item = NSMenuItem(title: title, action: action, keyEquivalent: ""); item.target = action == #selector(NSApplication.terminate(_:)) ? NSApp : self; menu.addItem(item)
            }
            let updateItem = NSMenuItem(title: "检查更新…", action: #selector(AppUpdater.checkForUpdates(_:)), keyEquivalent: ""); updateItem.target = updater; menu.insertItem(updateItem, at: 2)
            statusItem.menu = menu; statusItem.button?.performClick(nil); statusItem.menu = nil; return
        }
        if controller.window.isVisible && controller.window.isKeyWindow { Task { await controller.hide() } }
        else { showNote() }
    }
    @objc func appendNote() { showNote(); controller.bridge.requestAppend() }
    @objc func findNote() { controller.bridge.send(["type": "requestSearch"]) }
    @objc func selectAllNoteText() {
        let webView = controller.bridge.webView
        if let responder = NSApp.keyWindow?.firstResponder as? NSView,
           responder === webView || responder.isDescendant(of: webView) {
            controller.bridge.selectAllText()
        } else {
            NSApp.sendAction(NSSelectorFromString("selectAll:"), to: nil, from: nil)
        }
    }
    @objc func saveNote() { controller.bridge.send(["type": "requestSave"]) }
    @objc func exportNote() { controller.exportNote() }
    @objc func showNote() {
        controller.show { [weak self] in
            guard let button = self?.statusItem?.button, let window = button.window, let screen = window.screen else { return nil }
            return (window.convertToScreen(button.convert(button.bounds, to: nil)), screen)
        }
    }
    @objc func hideSafely() { Task { await controller.hide() } }
    @objc private func selectPage(_ sender: NSMenuItem) { controller.selectPage(sender.tag) }
    private func registerHotKey() {
        var type = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let context = Unmanaged.passUnretained(self).toOpaque()
        InstallEventHandler(GetApplicationEventTarget(), { _, event, context in
            guard let context else { return OSStatus(eventNotHandledErr) }
            var hotKeyID = EventHotKeyID()
            if let event { GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID), nil, MemoryLayout<EventHotKeyID>.size, nil, &hotKeyID) }
            MainActor.assumeIsolated {
                let owner = Unmanaged<AppDelegate>.fromOpaque(context).takeUnretainedValue()
                if hotKeyID.id == 2 { owner.appendNote() } else { owner.toggleNote() }
            }
            return noErr
        }, 1, &type, context, &eventHandler)
        do { try controller.bridge.onHotKey?(controller.bridge.settings.hotKey) }
        catch { controller.bridge.hotKeyError = error.localizedDescription }
    }
    private func buildMenu() {
        let menu = NSMenu()
        let app = NSMenu(); let root = NSMenuItem(); root.submenu = app; menu.addItem(root)
        let show = NSMenuItem(title: "打开便签", action: #selector(showNote), keyEquivalent: ""); show.target = self; app.addItem(show)
        let updateItem = NSMenuItem(title: "检查更新…", action: #selector(AppUpdater.checkForUpdates(_:)), keyEquivalent: ""); updateItem.target = updater; app.addItem(updateItem)
        let automatic = NSMenuItem(title: "自动检查更新", action: #selector(AppUpdater.toggleAutomaticChecks(_:)), keyEquivalent: ""); automatic.target = updater; app.addItem(automatic)
        app.addItem(.separator()); app.addItem(withTitle: "退出 Jot", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let file = NSMenu(); let fileRoot = NSMenuItem(title: "文件", action: nil, keyEquivalent: ""); fileRoot.submenu = file; menu.addItem(fileRoot)
        for (index, name) in ["灵感", "工作", "日常", "阅读", "草稿", "随想", "生活"].enumerated() {
            let item = NSMenuItem(title: name, action: #selector(selectPage(_:)), keyEquivalent: String(index + 1)); item.tag = index; item.target = self; file.addItem(item); pageMenuItems.append(item)
        }
        file.addItem(.separator())
        let append = NSMenuItem(title: "新建无格式正文", action: #selector(appendNote), keyEquivalent: ""); append.target = self; file.addItem(append)
        let save = NSMenuItem(title: "立即保存", action: #selector(saveNote), keyEquivalent: "s"); save.target = self; file.addItem(save)
        let export = NSMenuItem(title: "导出当前页…", action: #selector(exportNote), keyEquivalent: "e"); export.keyEquivalentModifierMask = [.command, .shift]; export.target = self; file.addItem(export)
        let close = NSMenuItem(title: "收起便签", action: #selector(hideSafely), keyEquivalent: "w"); close.target = self; file.addItem(close)
        let edit = NSMenu(); let editRoot = NSMenuItem(title: "编辑", action: nil, keyEquivalent: ""); editRoot.submenu = edit; menu.addItem(editRoot)
        for (title, action, key) in [("撤销", "undo:", "z"), ("剪切", "cut:", "x"), ("拷贝", "copy:", "c"), ("粘贴", "paste:", "v")] { edit.addItem(withTitle: title, action: Selector(action), keyEquivalent: key) }
        let selectAll = NSMenuItem(title: "全选", action: #selector(selectAllNoteText), keyEquivalent: "a"); selectAll.target = self; edit.addItem(selectAll)
        let redo = NSMenuItem(title: "重做", action: NSSelectorFromString("redo:"), keyEquivalent: "z"); redo.keyEquivalentModifierMask = [.command, .shift]; edit.insertItem(redo, at: 1)
        let find = NSMenuItem(title: "查找便签", action: #selector(findNote), keyEquivalent: "f"); find.target = self; edit.addItem(find)
        NSApp.mainMenu = menu
    }
}
