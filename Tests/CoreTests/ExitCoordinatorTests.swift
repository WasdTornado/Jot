import XCTest
@testable import TotNotesCore

@MainActor final class ExitCoordinatorTests: XCTestCase {
    func testSuccessfulFlushAllowsClosing() async {
        let coordinator = ExitCoordinator(flush: {})
        let allowed = await coordinator.flushBeforeClosing(timeout: .milliseconds(100))
        XCTAssertTrue(allowed)
    }
    func testFailedFlushKeepsWindowOpen() async {
        let coordinator = ExitCoordinator(flush: { throw CocoaError(.fileWriteNoPermission) })
        let allowed = await coordinator.flushBeforeClosing(timeout: .milliseconds(100))
        XCTAssertFalse(allowed)
    }
    func testTimeoutDoesNotWaitForAnUnresponsiveEditor() async {
        var resume: CheckedContinuation<Void, Never>?
        let coordinator = ExitCoordinator(flush: { await withCheckedContinuation { resume = $0 } })
        let allowed = await coordinator.flushBeforeClosing(timeout: .milliseconds(20))
        XCTAssertFalse(allowed)
        resume?.resume()
    }
    func testCannotCloseWhileLatestEditIsStillSaving() async {
        var resume: CheckedContinuation<Void, Never>?
        let started = expectation(description: "已开始保存")
        let coordinator = ExitCoordinator(flush: { await withCheckedContinuation { resume = $0; started.fulfill() } })
        var finished = false
        let request = Task { let allowed = await coordinator.flushBeforeClosing(timeout: .seconds(1)); finished = true; return allowed }
        await fulfillment(of: [started], timeout: 1)
        XCTAssertFalse(finished)
        resume?.resume()
        let allowed = await request.value
        XCTAssertTrue(allowed)
    }
    func testConcurrentCloseRequestsWaitForTheSameSave() async {
        var resume: CheckedContinuation<Void, Never>?
        var calls = 0
        let started = expectation(description: "保存已开始")
        let coordinator = ExitCoordinator(flush: {
            calls += 1
            await withCheckedContinuation { resume = $0; started.fulfill() }
        })
        let first = Task { await coordinator.flushBeforeClosing() }
        await fulfillment(of: [started], timeout: 1)
        var secondFinished = false
        let second = Task { let result = await coordinator.flushBeforeClosing(); secondFinished = true; return result }
        await Task.yield()
        XCTAssertFalse(secondFinished, "收起时再退出应等待保存，而不是报告保存失败")
        resume?.resume()
        let results = await [first.value, second.value]
        XCTAssertEqual(results, [true, true]); XCTAssertEqual(calls, 1)
    }
}
