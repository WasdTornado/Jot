import AppKit
import WebKit
// 独立验收窗口，只写入测试结果，不读取正式便签。
final class Harness: NSObject, NSApplicationDelegate, WKScriptMessageHandler {
    var window: NSWindow!
    var web: WKWebView!
    func applicationDidFinishLaunching(_ notification: Notification) {
        let config = WKWebViewConfiguration(); config.userContentController.add(self, name: "qa")
        web = WKWebView(frame: .zero, configuration: config)
        window = NSWindow(contentRect: NSRect(x: 180, y: 180, width: 620, height: 620), styleMask: [.titled,.closable,.resizable], backing: .buffered, defer: false)
        window.title = "Jot 编辑回归 · 隔离测试"; window.contentView = web
        let root = NSMenu(); let item = NSMenuItem(); let edit = NSMenu(); item.submenu = edit; root.addItem(item)
        for (title, action, key) in [("全选","selectAllNote:","a"),("复制","copy:","c"),("粘贴","paste:","v"),("撤销","undo:","z"),("退出","terminate:","q")] { edit.addItem(withTitle:title,action:Selector(action),keyEquivalent:key) }
        NSApp.mainMenu = root
        let resources = Bundle.main.resourceURL!
        web.loadFileURL(resources.appendingPathComponent("index.html"), allowingReadAccessTo: resources)
        window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps:true); window.makeFirstResponder(web)
    }
    @objc func selectAllNote(_ sender: Any?) {
        web.evaluateJavaScript("window.totNotes.selectAll()")
    }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        if let data = try? JSONSerialization.data(withJSONObject:message.body, options:[.prettyPrinted,.sortedKeys]) {
            let folder = FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0].appendingPathComponent("TotNotesQA/editor-harness")
            try? FileManager.default.createDirectory(at:folder,withIntermediateDirectories:true)
            try? data.write(to:folder.appendingPathComponent("result.json"),options:.atomic)
        }
    }
}
let app = NSApplication.shared
let delegate = Harness(); app.delegate = delegate; app.setActivationPolicy(.regular); app.run()
