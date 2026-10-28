import Foundation
struct MarkdownExportFile: Codable { let name: String; let text: String }
enum MarkdownExport {
    static func validName(_ name: String) -> Bool {
        !name.isEmpty && name.hasSuffix(".md") && !name.hasPrefix(".") &&
        !name.contains("/") && !name.contains("\\") && !name.contains(":") &&
        name.rangeOfCharacter(from: .controlCharacters) == nil && name.utf8.count < 240
    }
    static func write(_ entries: [MarkdownExportFile], to parent: URL, files: DocumentFiles = DocumentFiles()) throws -> URL {
        guard entries.count == 7, Set(entries.map { $0.name.lowercased() }).count == 7,
              entries.allSatisfy({ validName($0.name) }) else { throw NoteError.invalidDocument }
        let date = DateFormatter(); date.dateFormat = "yyyyMMdd-HHmmss"
        let folder = parent.appendingPathComponent("Jot-\(date.string(from: Date()))-\(UUID().uuidString.prefix(8))")
        guard !files.exists(folder) else { throw CocoaError(.fileWriteFileExists) }
        try files.createDirectory(folder)
        do {
            for entry in entries { try files.atomicWrite(Data(entry.text.utf8), folder.appendingPathComponent(entry.name)) }
        } catch {
            // 失败仅移除本次新建的目录，绝不触碰用户已有的导出文件。
            try? files.remove(folder); throw error
        }
        return folder
    }
}
