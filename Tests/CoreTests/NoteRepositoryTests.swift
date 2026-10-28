import XCTest
@testable import TotNotesCore

final class NoteRepositoryTests: XCTestCase {
    func temporaryDirectory() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return url
    }

    func note(_ revision: Int64 = 1, text: String = "今天整理会议记录") throws -> NoteSnapshot {
        let data = Data("""
        {"type":"doc","content":[{"type":"taskList","content":[{"type":"taskItem","attrs":{"checked":true},"content":[{"type":"paragraph","content":[{"type":"text","text":"\(text)"}]}]}]}]}
        """.utf8)
        return NoteSnapshot(schemaVersion: 1, pageID: "page-1", revision: revision,
                            updatedAt: Date(timeIntervalSince1970: 1000),
                            document: try JSONDecoder().decode(JSONValue.self, from: data),
                            selection: EditorSelection(anchor: 2, head: 2))
    }

    func testReloadPreservesChineseAndTaskState() async throws {
        let dir = try temporaryDirectory()
        let original = try note()
        let repo = NoteRepository(directory: dir)
        _ = try await repo.save(original)
        let restored = try await NoteRepository(directory: dir).load(pageID: "page-1")
        XCTAssertEqual(restored?.snapshot, original)
        XCTAssertEqual(restored?.recovered, false)
    }

    func testManualRestorePreservesCurrentVersionEvenWithinBackupThrottle() async throws {
        let repo = NoteRepository(directory: try temporaryDirectory(), now: { Date(timeIntervalSince1970: 2000) })
        _ = try await repo.save(note(1, text: "旧正文")); _ = try await repo.save(note(2, text: "当前正文"))
        let history = try await repo.history(pageID: "page-1")
        let selected = try XCTUnwrap(history.first)
        let restored = try await repo.restore(pageID: "page-1", backupID: selected.id, expectedRevision: 2)
        XCTAssertEqual(restored.revision, 3)
        XCTAssertEqual(restored.document, try note(1, text: "旧正文").document)
        let updatedHistory = try await repo.history(pageID: "page-1")
        XCTAssertTrue(updatedHistory.contains { $0.snapshot.document == (try? note(2, text: "当前正文").document) })
        do { _ = try await repo.restore(pageID: "page-1", backupID: selected.id, expectedRevision: 2); XCTFail("旧修订号不能覆盖恢复后的正文") } catch { }
        do { _ = try await repo.restore(pageID: "page-1", backupID: "../page-1.json", expectedRevision: 3); XCTFail("不能越过备份目录") } catch { }
    }

    func testFailedRestoreRetainsCurrentFileAndItsBackup() async throws {
        let directory = try temporaryDirectory()
        let original = NoteRepository(directory: directory)
        _ = try await original.save(note(1, text: "历史")); _ = try await original.save(note(2, text: "当前"))
        var files = DocumentFiles()
        files.atomicWrite = { data, url in
            if url.lastPathComponent == "page-1.json" { throw CocoaError(.fileWriteNoPermission) }
            try data.write(to: url, options: .atomic)
        }
        let repository = NoteRepository(directory: directory, files: files)
        let history = try await repository.history(pageID: "page-1")
        do { _ = try await repository.restore(pageID: "page-1", backupID: XCTUnwrap(history.first).id, expectedRevision: 2); XCTFail("应报告写入失败") } catch { }
        let current = try await NoteRepository(directory: directory).load(pageID: "page-1")
        XCTAssertEqual(current?.snapshot.document, try note(2, text: "当前").document)
        let backups = try await repository.history(pageID: "page-1")
        XCTAssertTrue(backups.contains { $0.snapshot.document == current?.snapshot.document })
    }
    func testStaleRevisionCannotOverwrite() async throws {
        let repo = NoteRepository(directory: try temporaryDirectory())
        _ = try await repo.save(note(4))
        let receipt = try await repo.save(note(2, text: "旧正文"))
        XCTAssertTrue(receipt.ignored)
        XCTAssertEqual(receipt.revision, 4)
        let loaded = try await repo.load(pageID: "page-1")
        XCTAssertEqual(loaded?.snapshot.revision, 4)
    }

    func testEmptyNoteIsValid() async throws {
        let repo = NoteRepository(directory: try temporaryDirectory())
        var empty = try note()
        empty.document = .object(["type": .string("doc"), "content": .array([.object(["type": .string("paragraph")])])])
        _ = try await repo.save(empty)
        let loaded = try await repo.load(pageID: "page-1")
        XCTAssertEqual(loaded?.snapshot.document, empty.document)
    }

    func testWriteFailureLeavesPriorDocumentIntact() async throws {
        let dir = try temporaryDirectory()
        _ = try await NoteRepository(directory: dir).save(note())
        var files = DocumentFiles()
        files.atomicWrite = { _, _ in throw CocoaError(.fileWriteNoPermission) }
        do { _ = try await NoteRepository(directory: dir, files: files).save(note(2)); XCTFail("应报告写入失败") }
        catch { }
        let loaded = try await NoteRepository(directory: dir).load(pageID: "page-1")
        XCTAssertEqual(loaded?.snapshot.revision, 1)
    }

    func testCorruptPrimaryPreservesFileAndRecoversBackup() async throws {
        let dir = try temporaryDirectory()
        let repo = NoteRepository(directory: dir)
        _ = try await repo.save(note(1))
        _ = try await repo.save(note(2, text: "已更新正文"))
        let damaged = Data("{broken".utf8)
        try damaged.write(to: dir.appendingPathComponent("page-1.json"))
        let recovered = try await NoteRepository(directory: dir).load(pageID: "page-1")
        XCTAssertEqual(recovered?.snapshot.revision, 1)
        XCTAssertEqual(recovered?.recovered, true)
        let preserved = try FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)
            .filter { $0.lastPathComponent.hasPrefix("corrupt-") }
        XCTAssertEqual(preserved.count, 1)
        XCTAssertEqual(try Data(contentsOf: XCTUnwrap(preserved.first)), damaged)
    }

    func testCorruptPrimaryWithoutBackupDoesNotInitializeBlank() async throws {
        let dir = try temporaryDirectory()
        let url = dir.appendingPathComponent("page-1.json")
        try Data("broken".utf8).write(to: url)
        do { _ = try await NoteRepository(directory: dir).load(pageID: "page-1"); XCTFail("应报告损坏") }
        catch { }
        XCTAssertEqual(try String(contentsOf: url), "broken")
    }

    func testSnapshotsRespect60SecondsAndLimit10() async throws {
        let dir = try temporaryDirectory()
        var time = Date(timeIntervalSince1970: 2000)
        let repo = NoteRepository(directory: dir, now: { time })
        _ = try await repo.save(note(1))
        _ = try await repo.save(note(2, text: "已更新正文"))
        _ = try await repo.save(note(3))
        let backups = dir.appendingPathComponent("backups/page-1")
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: backups.path).count, 1)
        for rev in 4...16 {
            time = time.addingTimeInterval(61)
            _ = try await repo.save(note(Int64(rev), text: "正文版本\(rev)"))
        }
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: backups.path).count, 10)
    }

    func testSelectionOnlyChangesDoNotConsumeHistory() async throws {
        let dir = try temporaryDirectory()
        var time = Date(timeIntervalSince1970: 2000)
        let repo = NoteRepository(directory: dir, now: { time })
        _ = try await repo.save(note(1, text: "旧正文"))
        _ = try await repo.save(note(2, text: "当前正文"))
        for revision in 3...15 {
            time = time.addingTimeInterval(61)
            var next = try note(Int64(revision), text: "当前正文")
            next.selection = EditorSelection(anchor: revision, head: revision)
            _ = try await repo.save(next)
        }
        let backups = dir.appendingPathComponent("backups/page-1")
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: backups.path).count, 1)
        let loaded = try await repo.load(pageID: "page-1")
        XCTAssertEqual(loaded?.snapshot.selection.anchor, 15)
        _ = try await repo.save(note(16, text: "新正文"))
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: backups.path).count, 2)
    }

    func testInvalidInternalNodesRecoverValidBackup() async throws {
        let invalidDocuments = [
            "{\"type\":\"doc\",\"content\":[{\"type\":\"unknownBrokenNode\"}]}",
            "{\"type\":\"doc\",\"content\":[{\"type\":\"taskList\",\"content\":[{\"type\":\"paragraph\"}]}]}",
            "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\"}]}]}",
            "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"正文\",\"marks\":[{\"type\":\"unknownMark\"}]}]}]}"
        ]
        for source in invalidDocuments {
            let dir = try temporaryDirectory()
            let repo = NoteRepository(directory: dir)
            _ = try await repo.save(note(1)); _ = try await repo.save(note(2, text: "已更新正文"))
            var damaged = try note(3)
            damaged.document = try JSONDecoder().decode(JSONValue.self, from: Data(source.utf8))
            let data = try NoteSnapshot.encoder().encode(damaged)
            try data.write(to: dir.appendingPathComponent("page-1.json"))
            let loaded = try await NoteRepository(directory: dir).load(pageID: "page-1")
            XCTAssertEqual(loaded?.recovered, true)
            XCTAssertEqual(loaded?.snapshot.revision, 1)
            XCTAssertEqual(try Data(contentsOf: dir.appendingPathComponent("page-1.json")), data)
        }
    }

    func testRejectsUnsafePageAndUnsupportedSchema() async throws {
        let repo = NoteRepository(directory: try temporaryDirectory())
        for invalid in ["../outside", ""] {
            var n = try note(); n.pageID = invalid
            do { _ = try await repo.save(n); XCTFail("应拒绝非法页 ID") } catch { }
        }
        var n = try note(); n.schemaVersion = 2
        do { _ = try await repo.save(n); XCTFail("应拒绝未来格式") } catch { }
    }
    func testUnsupportedFormatNeverFallsBackToOlderBackup() async throws {
        let dir = try temporaryDirectory()
        let repo = NoteRepository(directory: dir)
        _ = try await repo.save(note(1)); _ = try await repo.save(note(2, text: "已更新正文"))
        var future = try note(5); future.schemaVersion = 2
        let data = try NoteSnapshot.encoder().encode(future)
        try data.write(to: dir.appendingPathComponent("page-1.json"))
        do { _ = try await NoteRepository(directory: dir).load(pageID: "page-1"); XCTFail("未来格式不可用旧备份替换") }
        catch { }
        XCTAssertEqual(try Data(contentsOf: dir.appendingPathComponent("page-1.json")), data)
    }
}
