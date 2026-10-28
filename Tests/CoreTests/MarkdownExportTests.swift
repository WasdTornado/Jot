import XCTest
@testable import TotNotesCore
final class MarkdownExportTests: XCTestCase {
    func testExportsSevenUniqueFilesAndCleansOnlyOwnFolderOnFailure() throws {
        let parent = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: parent, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: parent) }
        let entries = (1...7).map { MarkdownExportFile(name: "\($0)-会议.md", text: "- [ ] 第\($0)页") }
        let folder = try MarkdownExport.write(entries, to: parent)
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: folder.path).count, 7)
        XCTAssertEqual(try String(contentsOf: folder.appendingPathComponent("1-会议.md"), encoding: .utf8), "- [ ] 第1页")
        var files = DocumentFiles(); files.atomicWrite = { _, _ in throw CocoaError(.fileWriteNoPermission) }
        XCTAssertThrowsError(try MarkdownExport.write(entries, to: parent, files: files))
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: parent.path), [folder.lastPathComponent])
        var unsafe = entries; unsafe[0] = MarkdownExportFile(name: "../外部.md", text: "不能写入")
        XCTAssertThrowsError(try MarkdownExport.write(unsafe, to: parent))
        unsafe = entries; unsafe[1] = entries[0]
        XCTAssertThrowsError(try MarkdownExport.write(unsafe, to: parent))
    }
}
