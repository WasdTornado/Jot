import AppKit
import Carbon

@MainActor final class HotKeyRecorder {
    private var monitor: Any?
    private var observer: NSObjectProtocol?
    private var completion: CheckedContinuation<HotKeySettings?, Never>?
    private var timeout: Task<Void, Never>?
    func record(onStart: () -> Void) async -> HotKeySettings? {
        guard completion == nil else { return nil }
        return await withCheckedContinuation { continuation in
            completion = continuation
            monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
                MainActor.assumeIsolated { self?.receive(event) }
                return nil
            }
            onStart()
            observer = NotificationCenter.default.addObserver(forName: NSApplication.didResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.finish(nil) }
            }
            timeout = Task { [weak self] in
                do { try await Task.sleep(for: .seconds(15)); self?.finish(nil) } catch { }
            }
        }
    }
    private func receive(_ event: NSEvent) {
        if event.keyCode == 53 { finish(nil); return }
        var modifiers: UInt32 = 0; var label = ""
        for (flag, carbon, symbol) in [(NSEvent.ModifierFlags.control, controlKey, "⌃"), (.option, optionKey, "⌥"), (.shift, shiftKey, "⇧"), (.command, cmdKey, "⌘")] {
            if event.modifierFlags.contains(flag) { modifiers |= UInt32(carbon); label += symbol }
        }
        let names: [UInt16: String] = [49: "空格", 36: "回车", 48: "Tab", 51: "删除", 123: "←", 124: "→", 125: "↓", 126: "↑"]
        let character = event.charactersIgnoringModifiers?.uppercased() ?? ""
        let keyName = names[event.keyCode] ?? (character.unicodeScalars.allSatisfy { !$0.properties.isWhitespace && $0.value >= 32 && $0.value < 127 } && !character.isEmpty ? character : "键\(event.keyCode)")
        var key = HotKeySettings(); key.keyCode = UInt32(event.keyCode); key.modifiers = modifiers; key.label = label + keyName
        guard (try? key.validate()) != nil else { NSSound.beep(); return }
        finish(key)
    }
    private func finish(_ key: HotKeySettings?) {
        if let monitor { NSEvent.removeMonitor(monitor) }; monitor = nil
        if let observer { NotificationCenter.default.removeObserver(observer) }; observer = nil
        timeout?.cancel(); timeout = nil
        let waiting = completion; completion = nil; waiting?.resume(returning: key)
    }
}
