import Foundation

actor NoteRepository {
    let directory: URL
    private let files: DocumentFiles
    private let now: () -> Date
    private var loaded: [String: LoadedNote] = [:]

    init(directory: URL, files: DocumentFiles = DocumentFiles(), now: @escaping () -> Date = Date.init) {
        self.directory = directory; self.files = files; self.now = now
    }
    private func path(_ pageID: String) throws -> URL {
        guard pageID.range(of: "^[A-Za-z0-9_-]{1,80}$", options: .regularExpression) != nil else { throw NoteError.invalidDocument }
        return directory.appendingPathComponent(pageID + ".json")
    }
    func load(pageID: String) throws -> LoadedNote? {
        if let cached = loaded[pageID] { return cached }
        let url = try path(pageID)
        guard files.exists(url) else { return nil }
        let data = try files.read(url)
        do {
            let result = LoadedNote(snapshot: try decode(data, pageID: pageID), recovered: false)
            loaded[pageID] = result
            return result
        } catch NoteError.unsupportedVersion {
            throw NoteError.unsupportedVersion
        } catch {
            // 保留损坏文件，绝不把解析失败解释成一张新便签。
            try files.atomicWrite(data, directory.appendingPathComponent("corrupt-\(UUID().uuidString).json"))
            let backupDirectory = directory.appendingPathComponent("backups/\(pageID)")
            let candidates = files.exists(backupDirectory) ? try files.list(backupDirectory) : []
            for candidate in candidates.sorted(by: { $0.lastPathComponent > $1.lastPathComponent }) where candidate.pathExtension == "json" {
                if let snapshot = try? decode(files.read(candidate), pageID: pageID) {
                    let result = LoadedNote(snapshot: snapshot, recovered: true)
                    loaded[pageID] = result
                    return result
                }
            }
            throw NoteError.damagedDocument
        }
    }
    private func decode(_ data: Data, pageID: String) throws -> NoteSnapshot {
        let snapshot = try NoteSnapshot.decoder().decode(NoteSnapshot.self, from: data)
        try snapshot.validate()
        guard snapshot.pageID == pageID else { throw NoteError.invalidDocument }
        return snapshot
    }
    func save(_ snapshot: NoteSnapshot) throws -> SaveReceipt {
        try snapshot.validate()
        let url = try path(snapshot.pageID)
        let old = try load(pageID: snapshot.pageID)?.snapshot
        if let old, old.revision >= snapshot.revision {
            return SaveReceipt(pageID: snapshot.pageID, revision: old.revision, ignored: true)
        }
        try files.createDirectory(directory)
        if let old, old.document != snapshot.document { try backup(old) }
        try files.atomicWrite(NoteSnapshot.encoder().encode(snapshot), url)
        loaded[snapshot.pageID] = LoadedNote(snapshot: snapshot, recovered: false)
        return SaveReceipt(pageID: snapshot.pageID, revision: snapshot.revision, ignored: false)
    }
    func history(pageID: String) throws -> [HistoryEntry] {
        _ = try path(pageID)
        let folder = directory.appendingPathComponent("backups/\(pageID)")
        guard files.exists(folder) else { return [] }
        return try files.list(folder).sorted { $0.lastPathComponent > $1.lastPathComponent }.compactMap { url in
            guard url.pathExtension == "json", let snapshot = try? decode(files.read(url), pageID: pageID) else { return nil }
            return HistoryEntry(id: url.lastPathComponent, snapshot: snapshot)
        }
    }
    func restore(pageID: String, backupID: String, expectedRevision: Int64) throws -> NoteSnapshot {
        guard let current = try load(pageID: pageID)?.snapshot, current.revision == expectedRevision,
              let selected = try history(pageID: pageID).first(where: { $0.id == backupID }) else { throw NoteError.invalidDocument }
        var restored = selected.snapshot
        restored.revision = current.revision + 1; restored.updatedAt = now()
        try restored.validate()
        // 恢复前的当前内容必须备份，不受普通自动备份的一分钟间隔限制。
        try backup(current, force: true)
        try files.atomicWrite(NoteSnapshot.encoder().encode(restored), path(pageID))
        loaded[pageID] = LoadedNote(snapshot: restored, recovered: false)
        return restored
    }
    func storedPageNames() throws -> [String: String]? {
        let url = directory.appendingPathComponent("page-names.json")
        guard files.exists(url) else { return nil }
        return try JSONDecoder().decode([String: String].self, from: files.read(url))
    }
    func savePageNames(_ names: [String: String]) throws {
        var settings = AppSettings(); settings.pageNames = names; try settings.validate()
        try files.createDirectory(directory)
        try files.atomicWrite(JSONEncoder().encode(names), directory.appendingPathComponent("page-names.json"))
    }
    func checkpoint(pageID: String) throws {
        if let current = try load(pageID: pageID)?.snapshot { try backup(current, force: true) }
    }
    func archive(pageNames: [String: String]) throws -> WorkspaceArchive {
        let notes = try (1...7).map { index -> NoteSnapshot in
            let pageID = "page-\(index)"
            return try load(pageID: pageID)?.snapshot ?? NoteSnapshot(schemaVersion: 1, pageID: pageID, revision: 0, updatedAt: now(),
                document: .object(["type": .string("doc"), "content": .array([.object(["type": .string("paragraph")])])]), selection: EditorSelection(anchor: 1, head: 1))
        }
        let result = WorkspaceArchive(createdAt: now(), pageNames: pageNames, notes: notes)
        try result.validate(); return result
    }
    func importArchive(_ incoming: WorkspaceArchive, currentNames: [String: String]) throws -> WorkspaceArchive {
        try incoming.validate()
        let current = try archive(pageNames: currentNames)
        try files.createDirectory(directory)
        let staging = directory.deletingLastPathComponent().appendingPathComponent(".import-\(UUID().uuidString)")
        defer { try? files.remove(staging) }
        try files.copyDirectory(directory, staging)
        let recoveryFolder = staging.appendingPathComponent("workspace-backups")
        try files.createDirectory(recoveryFolder)
        let name = String(format: "%020lld", Int64(now().timeIntervalSince1970 * 1000)) + "-\(UUID().uuidString).json"
        try files.atomicWrite(NoteSnapshot.encoder().encode(current), recoveryFolder.appendingPathComponent(name))
        var restored = incoming; restored.createdAt = now()
        restored.notes = try incoming.notes.sorted { $0.pageID < $1.pageID }.map { note in
            var next = note
            next.revision = current.notes.first { $0.pageID == note.pageID }!.revision + 1
            next.updatedAt = now(); try next.validate()
            try files.atomicWrite(NoteSnapshot.encoder().encode(next), staging.appendingPathComponent(next.pageID + ".json"))
            return next
        }
        try files.atomicWrite(JSONEncoder().encode(incoming.pageNames), staging.appendingPathComponent("page-names.json"))
        // 七页和恢复前备份全部准备成功后，才在同一磁盘上原子交换目录。
        // 崩溃发生在交换前后，都只会看到完整的一套便签。
        try files.swapDirectories(staging, directory)
        loaded = Dictionary(uniqueKeysWithValues: restored.notes.map { ($0.pageID, LoadedNote(snapshot: $0, recovered: false)) })
        return restored
    }
    func latestRecoveryArchive() throws -> WorkspaceArchive {
        let folder = directory.appendingPathComponent("workspace-backups")
        guard files.exists(folder) else { throw NSError(domain: "TotNotes", code: 1, userInfo: [NSLocalizedDescriptionKey: "还没有整套恢复记录。导入后会自动保留恢复前的备份。"] ) }
        for url in try files.list(folder).sorted(by: { $0.lastPathComponent > $1.lastPathComponent }) where url.pathExtension == "json" {
            if let archive = try? NoteSnapshot.decoder().decode(WorkspaceArchive.self, from: files.read(url)), (try? archive.validate()) != nil { return archive }
        }
        throw NoteError.damagedDocument
    }
    private func backup(_ snapshot: NoteSnapshot, force: Bool = false) throws {
        let folder = directory.appendingPathComponent("backups/\(snapshot.pageID)")
        try files.createDirectory(folder)
        let existing = try files.list(folder).filter { $0.pathExtension == "json" }.sorted { $0.lastPathComponent < $1.lastPathComponent }
        let seconds = now().timeIntervalSince1970
        if !force, let last = existing.last,
           let stamp = Double(last.lastPathComponent.prefix(20)), seconds - stamp / 1000 < 60 { return }
        let name = String(format: "%020lld-%020lld", Int64(seconds * 1000), snapshot.revision) + "-\(UUID().uuidString).json"
        try files.atomicWrite(NoteSnapshot.encoder().encode(snapshot), folder.appendingPathComponent(name))
        for excess in existing.prefix(max(0, existing.count + 1 - 10)) { try files.remove(excess) }
    }
}
struct HistoryEntry: Codable { let id: String; let snapshot: NoteSnapshot }
