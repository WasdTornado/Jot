import Foundation

struct WorkspaceArchive: Codable {
    var format = "tot-notes-backup"
    var version = 1
    var createdAt: Date
    var pageNames: [String: String]
    var notes: [NoteSnapshot]
    static func decode(_ data: Data) throws -> WorkspaceArchive {
        do {
            let archive = try NoteSnapshot.decoder().decode(WorkspaceArchive.self, from: data)
            try archive.validate(); return archive
        } catch {
            throw NSError(domain: "TotNotes", code: 3, userInfo: [NSLocalizedDescriptionKey: "这不是有效的Jot 完整备份，或备份版本不受支持。请选择 Jot 导出的 JSON 备份；当前便签没有改动。"])
        }
    }
    func validate() throws {
        guard format == "tot-notes-backup", version == 1, notes.count == 7,
              Set(notes.map(\.pageID)) == Set((1...7).map { "page-\($0)" }) else { throw NoteError.invalidDocument }
        var settings = AppSettings(); settings.pageNames = pageNames; try settings.validate()
        for note in notes { try note.validate() }
    }
}
