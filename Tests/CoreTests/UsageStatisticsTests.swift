import XCTest
@testable import TotNotesCore

@MainActor final class UsageStatisticsTests: XCTestCase {
    func testActivityDeduplicatesAndUsesOnlyFourFields() async throws {
        let name = "usage-test-" + UUID().uuidString
        let defaults = UserDefaults(suiteName: name)!
        defer { defaults.removePersistentDomain(forName: name) }
        var requests: [URLRequest] = []
        let stats = UsageStatistics(defaults: defaults, endpoint: URL(string: "https://example.com/events"), version: "0.2.3", send: { request in requests.append(request); return 204 })
        let first = ISO8601DateFormatter().date(from:"2026-10-30T04:00:00Z")!
        stats.setEnabled(true)
        stats.recordActivity(now: first); stats.recordActivity(now: first)
        await stats.waitForPending()
        stats.recordActivity(now: first.addingTimeInterval(120)); await stats.waitForPending()
        XCTAssertEqual(requests.count, 1)
        let data = try XCTUnwrap(requests.first?.httpBody)
        let body = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String:String])
        XCTAssertEqual(Set(body.keys), ["installation_id", "date", "version", "event"])
        XCTAssertEqual(body["event"], "active_install")
        XCTAssertNotNil(UUID(uuidString: body["installation_id"]!))
        stats.recordActivity(now: first.addingTimeInterval(86400)); await stats.waitForPending()
        XCTAssertEqual(requests.count, 2)
        let second = try JSONSerialization.jsonObject(with: requests[1].httpBody!) as! [String:String]
        XCTAssertEqual(second["installation_id"], body["installation_id"])
        let reopened = UsageStatistics(defaults: defaults, endpoint: URL(string: "https://example.com/events"), version: "0.2.4", send: { _ in XCTFail("同日重启和升级不应重新发送"); return 204 })
        reopened.setEnabled(true); reopened.recordActivity(now: first.addingTimeInterval(86400)); await reopened.waitForPending()
    }
    func testDisabledAndMissingEndpointNeverGenerateIdentity() async {
        let name = "usage-test-" + UUID().uuidString
        let defaults = UserDefaults(suiteName:name)!
        defer { defaults.removePersistentDomain(forName:name) }
        for endpoint in [nil, URL(string:"http://example.com/events")] {
            let stats = UsageStatistics(defaults:defaults, endpoint:endpoint, version:"0.2.3", send: { _ in XCTFail("禁止发送"); return 204 })
            stats.setEnabled(true); stats.recordActivity(); await stats.waitForPending()
        }
        let disabled = UsageStatistics(defaults:defaults, endpoint:URL(string:"https://example.com/events"), version:"0.2.3", send: { _ in XCTFail("禁止发送"); return 204 })
        disabled.recordActivity(); await disabled.waitForPending()
        XCTAssertNil(defaults.string(forKey:"usage.installationID"))
    }
    func testFailureRetriesOnlyOnLaterActivityAndSwitchCancels() async {
        let name = "usage-test-" + UUID().uuidString
        let defaults = UserDefaults(suiteName:name)!
        defer { defaults.removePersistentDomain(forName:name) }
        var calls = 0
        let stats = UsageStatistics(defaults:defaults, endpoint:URL(string:"https://example.com/events"), version:"0.2.3", send: { _ in calls += 1; return calls == 1 ? 503 : 204 })
        stats.setEnabled(true)
        let now = Date()
        stats.recordActivity(now:now); await stats.waitForPending()
        XCTAssertNil(defaults.string(forKey:"usage.lastDay"))
        stats.recordActivity(now:now.addingTimeInterval(1)); await stats.waitForPending()
        XCTAssertEqual(calls, 1)
        stats.recordActivity(now:now.addingTimeInterval(61)); await stats.waitForPending()
        XCTAssertEqual(calls, 2)
        stats.setEnabled(false)
        stats.recordActivity(now:now.addingTimeInterval(86400)); await stats.waitForPending()
        XCTAssertEqual(calls, 2)
    }
    func testBeijingDayAndLegacySettings() throws {
        let formatter = ISO8601DateFormatter()
        XCTAssertEqual(UsageEvent.day(formatter.date(from:"2026-10-29T15:59:59Z")!), "2026-10-29")
        XCTAssertEqual(UsageEvent.day(formatter.date(from:"2026-10-29T16:00:00Z")!), "2026-10-30")
        let legacy = try JSONDecoder().decode(AppSettings.self, from: Data("{}".utf8))
        XCTAssertTrue(legacy.usageStatistics)
        var disabled = legacy; disabled.usageStatistics = false
        XCTAssertFalse(try JSONDecoder().decode(AppSettings.self, from: JSONEncoder().encode(disabled)).usageStatistics)
    }
}
