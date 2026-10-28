import Foundation

enum JSONValue: Codable, Equatable {
    case object([String: JSONValue]), array([JSONValue]), string(String), number(Double), bool(Bool), null

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else if let v = try? c.decode(Double.self) { self = .number(v) }
        else if let v = try? c.decode([JSONValue].self) { self = .array(v) }
        else { self = .object(try c.decode([String: JSONValue].self)) }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .object(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .string(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .bool(let v): try c.encode(v)
        case .null: try c.encodeNil()
        }
    }
    subscript(_ key: String) -> JSONValue? {
        guard case .object(let value) = self else { return nil }
        return value[key]
    }
}

struct EditorSelection: Codable, Equatable { var anchor: Int; var head: Int; var scrollTop: Double? = nil }
struct NoteSnapshot: Codable, Equatable {
    var schemaVersion: Int
    var pageID: String
    var revision: Int64
    var updatedAt: Date
    var document: JSONValue
    var selection: EditorSelection

    func validate() throws {
        guard schemaVersion == 1 else { throw NoteError.unsupportedVersion }
        guard revision >= 0, revision <= 9_007_199_254_740_991,
              !pageID.isEmpty, pageID.count <= 80,
              pageID.range(of: "^[A-Za-z0-9_-]+$", options: .regularExpression) != nil,
              document["type"] == .string("doc"),
              selection.anchor >= 0, selection.head >= 0 else { throw NoteError.invalidDocument }
        guard case .array = document["content"] else { throw NoteError.invalidDocument }
        if let scroll = selection.scrollTop, (!scroll.isFinite || scroll < 0) { throw NoteError.invalidDocument }
        try validateNode(document)
    }
    // 与编辑器启用的节点结构对应，在选择有效备份前检查内部内容。
    private func validateNode(_ node: JSONValue, depth: Int = 0) throws {
        guard depth < 100, case .object = node, case .string(let type) = node["type"] else { throw NoteError.invalidDocument }
        let children: [JSONValue]
        if let content = node["content"] {
            guard case .array(let values) = content else { throw NoteError.invalidDocument }
            children = values
        } else { children = [] }
        let blocks: Set<String> = ["paragraph", "heading", "blockquote", "codeBlock", "horizontalRule", "bulletList", "orderedList", "taskList"]
        func all(_ allowed: Set<String>) -> Bool {
            children.allSatisfy { child in
                guard case .string(let name) = child["type"] else { return false }
                return allowed.contains(name)
            }
        }
        var valid = false
        switch type {
        case "doc", "blockquote": valid = !children.isEmpty && all(blocks)
        case "paragraph", "heading": valid = all(["text", "hardBreak"])
        case "codeBlock": valid = all(["text"]) && children.allSatisfy { $0["marks"] == nil || $0["marks"] == .array([]) }
        case "bulletList", "orderedList": valid = !children.isEmpty && all(["listItem"])
        case "taskList": valid = !children.isEmpty && all(["taskItem"])
        case "listItem", "taskItem": valid = children.first?["type"] == .string("paragraph") && all(blocks)
        case "text":
            if case .string(let text) = node["text"] { valid = !text.isEmpty && children.isEmpty }
        case "hardBreak", "horizontalRule": valid = children.isEmpty
        default: break
        }
        if type == "heading", let level = node["attrs"]?["level"] {
            valid = valid && [.number(1), .number(2), .number(3)].contains(level)
        }
        if type == "taskItem", let checked = node["attrs"]?["checked"] {
            if case .bool = checked { } else { valid = false }
        }
        guard valid else { throw NoteError.invalidDocument }
        if let marks = node["marks"] {
            guard ["text", "hardBreak"].contains(type), case .array(let values) = marks else { throw NoteError.invalidDocument }
            let allowed = ["bold", "italic", "strike", "code", "link", "underline"]
            for mark in values {
                guard case .object = mark, case .string(let name) = mark["type"], allowed.contains(name) else { throw NoteError.invalidDocument }
            }
        }
        for child in children { try validateNode(child, depth: depth + 1) }
    }
    static func encoder() -> JSONEncoder {
        let e = JSONEncoder(); e.dateEncodingStrategy = .iso8601
        e.outputFormatting = [.prettyPrinted, .sortedKeys]; return e
    }
    static func decoder() -> JSONDecoder {
        let d = JSONDecoder()
        // 网页日期可能包含毫秒，兼容历史无毫秒格式。
        d.dateDecodingStrategy = .custom { decoder in
            let text = try decoder.singleValueContainer().decode(String.self)
            let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = f.date(from: text) { return date }
            f.formatOptions = [.withInternetDateTime]
            guard let date = f.date(from: text) else { throw NoteError.invalidDocument }
            return date
        }
        return d
    }
}

struct LoadedNote { let snapshot: NoteSnapshot; let recovered: Bool }
struct SaveReceipt: Codable { let pageID: String; let revision: Int64; let ignored: Bool }
enum NoteError: Error, LocalizedError {
    case invalidDocument, damagedDocument, unsupportedVersion
    var errorDescription: String? {
        switch self {
        case .invalidDocument: return "便签格式无效，原文件保持不变。"
        case .damagedDocument: return "便签文件损坏且没有有效备份，原文件已保留。"
        case .unsupportedVersion: return "这份便签来自更新版本，当前应用不会覆盖它。"
        }
    }
}
