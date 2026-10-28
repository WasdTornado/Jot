import XCTest
@testable import TotNotesCore
final class WorkspaceArchiveTests: XCTestCase {
    func testArchiveRestoresAllPagesAndNamesWithNewRevisionsAndRecoveryCopy() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let repo = NoteRepository(directory: directory)
        var archive = try await repo.archive(pageNames: ["page-1": "工作项目"])
        archive.notes[0].document = .object(["type": .string("doc"), "content": .array([.object(["type": .string("paragraph"), "content": .array([.object(["type": .string("text"), "text": .string("导入内容")])])])])])
        let restored = try await repo.importArchive(archive, currentNames: [:])
        XCTAssertEqual(restored.notes.count, 7); XCTAssertEqual(restored.notes[0].revision, 1)
        let fresh = NoteRepository(directory: directory)
        let current = try await fresh.archive(pageNames: restored.pageNames)
        XCTAssertEqual(current.notes[0].document, archive.notes[0].document)
        XCTAssertEqual(current.pageNames["page-1"], "工作项目")
        let storedNames = try await fresh.storedPageNames()
        XCTAssertEqual(storedNames, current.pageNames)
        let recovery = try await fresh.latestRecoveryArchive()
        XCTAssertNotEqual(recovery.notes[0].document, current.notes[0].document)
        _ = try await fresh.importArchive(recovery, currentNames: current.pageNames)
        let old = try await fresh.load(pageID: "page-1")
        XCTAssertEqual(old?.snapshot.revision, 2); XCTAssertEqual(old?.snapshot.document, recovery.notes[0].document)
    }
    func testInvalidArchiveAndStagingFailureLeaveAllCurrentPagesUntouched() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let original = NoteRepository(directory: directory)
        let archive = try await original.archive(pageNames: [:])
        for var note in archive.notes { note.revision = 3; _ = try await original.save(note) }
        var invalid = archive; invalid.notes.removeLast()
        do { _ = try await original.importArchive(invalid, currentNames: [:]); XCTFail("不完整备份必须拒绝") } catch { }
        var files = DocumentFiles()
        files.atomicWrite = { data, url in
            if url.path.contains(".import-") && url.lastPathComponent == "page-4.json" { throw CocoaError(.fileWriteNoPermission) }
            try data.write(to: url, options: .atomic)
        }
        let failing = NoteRepository(directory: directory, files: files)
        do { _ = try await failing.importArchive(archive, currentNames: [:]); XCTFail("准备失败不得替换目录") } catch { }
        let current = try await NoteRepository(directory: directory).archive(pageNames: [:])
        XCTAssertEqual(current.notes.map(\.revision), [3, 3, 3, 3, 3, 3, 3])
    }
    func testSwapFailureKeepsDiskAndNamesAndCleansStagingDirectory() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let directory = root.appendingPathComponent("notes")
        defer { try? FileManager.default.removeItem(at: root) }
        let repo = NoteRepository(directory: directory)
        try await repo.savePageNames(["page-1": "原页名"])
        var archive = try await repo.archive(pageNames: [:])
        for var note in archive.notes { note.revision = 8; _ = try await repo.save(note) }
        archive.pageNames = ["page-1": "新页名"]
        var files = DocumentFiles(); files.swapDirectories = { _, _ in throw CocoaError(.fileWriteNoPermission) }
        do { _ = try await NoteRepository(directory: directory, files: files).importArchive(archive, currentNames: ["page-1": "原页名"]); XCTFail("交换失败应抛错") } catch { }
        let fresh = NoteRepository(directory: directory)
        let saved = try await fresh.load(pageID: "page-1")
        let names = try await fresh.storedPageNames()
        XCTAssertEqual(saved?.snapshot.revision, 8); XCTAssertEqual(names?["page-1"], "原页名")
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: root.path), ["notes"])
    }

    func testInvalidBackupExplainsRecoveryWithoutChangingData() {
        XCTAssertThrowsError(try WorkspaceArchive.decode(Data("{\"format\":\"invalid\"}".utf8))) { error in
            XCTAssertTrue(error.localizedDescription.contains("当前便签没有改动"))
        }
    }

}
