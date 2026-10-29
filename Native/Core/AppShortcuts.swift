import Foundation

// 应用操作可修改，系统编辑键与书写格式键保持固定。
enum AppShortcuts {
    static let defaults: [String: HotKeySettings] = [
        "search": .init(keyCode: 3, modifiers: 256, label: "⌘F"),
        "previous": .init(keyCode: 123, modifiers: 2304, label: "⌥⌘←"),
        "next": .init(keyCode: 124, modifiers: 2304, label: "⌥⌘→"),
        "export": .init(keyCode: 14, modifiers: 768, label: "⇧⌘E")
    ]
    static let letters: [UInt32: String] = [0:"a",1:"s",2:"d",3:"f",4:"h",5:"g",6:"z",7:"x",8:"c",9:"v",11:"b",12:"q",13:"w",14:"e",15:"r",16:"y",17:"t",31:"o",32:"u",34:"i",35:"p",37:"l",38:"j",40:"k",45:"n",46:"m"]
    static func same(_ a: HotKeySettings, _ b: HotKeySettings) -> Bool { a.keyCode == b.keyCode && a.modifiers == b.modifiers }
    static func isAllowed(_ key: HotKeySettings) -> Bool {
        if defaults.values.contains(where: { same($0, key) }) { return true }
        guard letters[key.keyCode] != nil, [UInt32(768),2304,2816].contains(key.modifiers) else { return false }
        // 保留删除线、引用、重做、粘贴为纯文本、代码块及系统常用组合。
        let reserved: [UInt32: Set<UInt32>] = [768:[1,11,6,9,12,45],2304:[8,13,12,4,46],2816:[9,13]]
        return reserved[key.modifiers]?.contains(key.keyCode) != true
    }
    static func validateGlobal(_ key: HotKeySettings) throws {
        try key.validate()
        // 全局呼出键不能截走全选、剪贴板和常规书写操作。
        let reserved: [UInt32: Set<UInt32>] = [256:[0,1,6,7,8,9,11,12,13,14,34,40], 768:[1,11,6,9], 2304:[8]]
        guard reserved[key.modifiers]?.contains(key.keyCode) != true else {
            throw NSError(domain: "Jot.Shortcuts", code: 2, userInfo: [NSLocalizedDescriptionKey: "此组合为标准编辑快捷键，请换一组呼出快捷键。"])
        }
    }
    static func validate(_ keys: [String: HotKeySettings], global: HotKeySettings) throws {
        guard Set(keys.keys) == Set(defaults.keys) else { throw NoteError.invalidDocument }
        var used = [global]
        if global.modifiers & 512 == 0 { var append = global; append.modifiers |= 512; used.append(append) }
        for key in keys.values {
            try key.validate()
            guard isAllowed(key), !used.contains(where: { same($0, key) }) else {
                throw NSError(domain: "Jot.Shortcuts", code: 1, userInfo: [NSLocalizedDescriptionKey: "此组合与现有快捷键冲突，或为编辑/系统保留键。请使用 ⌘⇧ 或 ⌘⌥ 加字母。"])
            }
            used.append(key)
        }
    }
}
