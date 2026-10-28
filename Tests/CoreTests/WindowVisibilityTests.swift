import XCTest
@testable import TotNotesCore

@MainActor final class WindowVisibilityTests: XCTestCase {
    func testReopeningCancelsAnOlderPendingHide() async {
        let coordinator = WindowVisibilityCoordinator()
        var finish: ((Bool) -> Void)?
        var hidden = false
        let pending = Task {
            await coordinator.hide(flush: { await withCheckedContinuation { c in finish = { c.resume(returning: $0) } } }, perform: { hidden = true })
        }
        while finish == nil { await Task.yield() }
        coordinator.shown(); finish?(true); await pending.value
        XCTAssertFalse(hidden)
    }
    func testSuccessfulFlushHidesAndFailurePreservesWindow() async {
        let coordinator = WindowVisibilityCoordinator()
        var hidden = false
        await coordinator.hide(flush: { false }, perform: { hidden = true })
        XCTAssertFalse(hidden)
        await coordinator.hide(flush: { true }, perform: { hidden = true })
        XCTAssertTrue(hidden)
    }
}
