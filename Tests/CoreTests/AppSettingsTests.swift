import XCTest
@testable import TotNotesCore

final class AppSettingsTests: XCTestCase {
    func testSettingsRoundTripAndDefaultKeepLegacyPage() throws {
        var settings = AppSettings()
        XCTAssertEqual(settings.pageID, "page-1")
        settings.pageID = "page-7"; settings.theme = "dark"; settings.fontSize = 18; settings.pinned = true
        let decoded = try JSONDecoder().decode(AppSettings.self, from: JSONEncoder().encode(settings))
        try decoded.validate()
        XCTAssertEqual(decoded, settings)
    }
    func testRejectsInvalidPagesAndPreferences() throws {
        var settings = AppSettings(); settings.pageID = "../notes"
        XCTAssertThrowsError(try settings.validate())
        settings = AppSettings(); settings.fontSize = 200
        XCTAssertThrowsError(try settings.validate())
        settings = AppSettings(); settings.theme = "other"
        XCTAssertThrowsError(try settings.validate())
    }
    func testLegacySettingsKeepPreferencesAndDefaultNewFields() throws {
        let data = Data(#"{"pageID":"page-7","theme":"dark","fontSize":18,"pinned":true,"reduceTransparency":true}"#.utf8)
        let settings = try JSONDecoder().decode(AppSettings.self, from: data)
        XCTAssertEqual(settings.pageID, "page-7"); XCTAssertTrue(settings.pinned)
        XCTAssertEqual(settings.windowWidth, 480); XCTAssertEqual(settings.windowHeight, 478)
        XCTAssertEqual(settings.hotKey, HotKeySettings())
        try settings.validate()
        var invalid = settings; invalid.windowWidth = 100
        XCTAssertThrowsError(try invalid.validate())
        invalid = settings; invalid.hotKey.modifiers = 512
        XCTAssertThrowsError(try invalid.validate())
    }
    func testHotKeyConflictRetainsOldRegistration() throws {
        var released: [UInt32] = []
        let binding = HotKeyRegistration<UInt32>(register: { key in
            if key.keyCode == 0 { throw CocoaError(.featureUnsupported) }; return key.keyCode
        }, unregister: { released.append($0) })
        try binding.apply(HotKeySettings())
        var conflict = HotKeySettings(); conflict.keyCode = 0
        XCTAssertThrowsError(try binding.apply(conflict))
        XCTAssertEqual(binding.current, HotKeySettings()); XCTAssertTrue(released.isEmpty)
        var available = HotKeySettings(); available.keyCode = 1
        try binding.apply(available)
        XCTAssertEqual(released, [49]); XCTAssertEqual(binding.current, available)
    }
    func testAllSevenNotesPersistIndependently() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let repository = NoteRepository(directory: directory)
        for index in 1...7 {
            let note = NoteSnapshot(schemaVersion: 1, pageID: "page-\(index)", revision: 1, updatedAt: Date(),
                document: .object(["type": .string("doc"), "content": .array([.object(["type": .string("paragraph"), "content": .array([.object(["type": .string("text"), "text": .string("第\(index)页")])])])])]), selection: EditorSelection(anchor: 1, head: 1))
            _ = try await repository.save(note)
        }
        let fresh = NoteRepository(directory: directory)
        for index in 1...7 {
            let loaded = try await fresh.load(pageID: "page-\(index)")
            XCTAssertEqual(loaded?.snapshot.pageID, "page-\(index)")
            XCTAssertEqual(loaded?.snapshot.document["content"], .array([.object(["type": .string("paragraph"), "content": .array([.object(["type": .string("text"), "text": .string("第\(index)页")])])])]))
        }
    }
}
