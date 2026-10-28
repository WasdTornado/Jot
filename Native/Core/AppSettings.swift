import Foundation

struct HotKeySettings: Codable, Equatable {
    var keyCode: UInt32 = 49
    var modifiers: UInt32 = 6144
    var label = "⌃⌥空格"
    func validate() throws {
        // Carbon 修饰键：Command 256、Shift 512、Option 2048、Control 4096。
        guard keyCode < 128, keyCode != 53, modifiers & 6400 != 0,
              modifiers & ~UInt32(6912) == 0, !label.isEmpty, label.count <= 30 else { throw NoteError.invalidDocument }
    }
}
struct AppSettings: Codable, Equatable {
    var pageNames: [String: String] = [:]
    var hideCompleted = false
    var pageID = "page-1"
    var theme = "system"
    static let skinIDs = ["default", "grid", "cream", "marker", "mint", "sakura", "manuscript", "sea"]
    var skin = "default"
    var fontFamily = "auto"
    var decorations = true
    var fontSize = 16
    var pinned = false
    var reduceTransparency = false
    var hotKey = HotKeySettings()
    var windowWidth = 480
    var windowHeight = 478
    init() { }
    enum CodingKeys: String, CodingKey { case pageNames, hideCompleted, pageID, theme, skin, fontFamily, decorations, fontSize, pinned, reduceTransparency, hotKey, windowWidth, windowHeight }
    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        pageNames = try values.decodeIfPresent([String: String].self, forKey: .pageNames) ?? [:]
        hideCompleted = try values.decodeIfPresent(Bool.self, forKey: .hideCompleted) ?? false
        pageID = try values.decodeIfPresent(String.self, forKey: .pageID) ?? pageID
        theme = try values.decodeIfPresent(String.self, forKey: .theme) ?? theme
        skin = try values.decodeIfPresent(String.self, forKey: .skin) ?? skin
        fontFamily = try values.decodeIfPresent(String.self, forKey: .fontFamily) ?? fontFamily
        decorations = try values.decodeIfPresent(Bool.self, forKey: .decorations) ?? decorations
        fontSize = try values.decodeIfPresent(Int.self, forKey: .fontSize) ?? fontSize
        pinned = try values.decodeIfPresent(Bool.self, forKey: .pinned) ?? pinned
        reduceTransparency = try values.decodeIfPresent(Bool.self, forKey: .reduceTransparency) ?? reduceTransparency
        hotKey = try values.decodeIfPresent(HotKeySettings.self, forKey: .hotKey) ?? hotKey
        windowWidth = try values.decodeIfPresent(Int.self, forKey: .windowWidth) ?? windowWidth
        windowHeight = try values.decodeIfPresent(Int.self, forKey: .windowHeight) ?? windowHeight
    }
    func validate() throws {
        guard (1...7).map({ "page-\($0)" }).contains(pageID),
              ["system", "light", "dark"].contains(theme), [15, 16, 18].contains(fontSize),
              Self.skinIDs.contains(skin),
              ["auto", "system", "hand", "serif"].contains(fontFamily),
              (360...900).contains(windowWidth), (360...1000).contains(windowHeight) else { throw NoteError.invalidDocument }
        guard pageNames.allSatisfy({ (1...7).map { "page-\($0)" }.contains($0.key) && !$0.value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && $0.value.count <= 20 && $0.value.rangeOfCharacter(from: .controlCharacters) == nil }) else { throw NoteError.invalidDocument }
        try hotKey.validate()
    }
}

// 先注册新键，再释放旧键；冲突或注册失败不影响已有的呼出方式。
final class HotKeyRegistration<Handle> {
    private(set) var current: HotKeySettings?
    private var handle: Handle?
    private let register: (HotKeySettings) throws -> Handle
    private let unregister: (Handle) -> Void
    init(register: @escaping (HotKeySettings) throws -> Handle, unregister: @escaping (Handle) -> Void) {
        self.register = register; self.unregister = unregister
    }
    func apply(_ settings: HotKeySettings) throws {
        try settings.validate()
        if current?.keyCode == settings.keyCode && current?.modifiers == settings.modifiers { current = settings; return }
        let next = try register(settings)
        if let handle { unregister(handle) }
        handle = next; current = settings
    }
    func dispose() { if let handle { unregister(handle) }; handle = nil; current = nil }
}
