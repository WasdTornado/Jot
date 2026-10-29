import XCTest
@testable import TotNotesCore

final class WindowMotionTests: XCTestCase {
    func testGenieEndpointsAndContinuousRowsFromDifferentScreens() {
        for origin in [CGRect(x: 20, y: 40, width: 480, height: 468), CGRect(x: -900, y: 800, width: 360, height: 900), CGRect(x: 2000, y: 200, width: 900, height: 990), CGRect(x: 0, y: -800, width: 480, height: 468), CGRect(x: 0, y: -200, width: 480, height: 468)] {
            let target = CGPoint(x: 700, y: 18)
            for fraction in [CGFloat(0), 0.5, 1] {
                let start = WindowMotion.row(fraction, progress: 0, origin: origin, target: target)
                XCTAssertEqual(start.left, origin.minX); XCTAssertEqual(start.width, origin.width)
                XCTAssertEqual(start.y, origin.minY + origin.height * fraction)
                let end = WindowMotion.row(fraction, progress: 1, origin: origin, target: target)
                XCTAssertEqual(end.left, target.x - 9, accuracy: 0.00001)
                XCTAssertEqual(end.y, target.y, accuracy: 0.00001)
            }
            for step in 0...100 {
                var previous = -CGFloat.infinity
                for index in 0...96 {
                    let row = WindowMotion.row(CGFloat(index) / 96, progress: CGFloat(step) / 100, origin: origin, target: target)
                    XCTAssertTrue(row.left.isFinite && row.y.isFinite && row.width >= 17.999)
                    XCTAssertGreaterThanOrEqual(row.y + 0.00001, previous)
                    previous = row.y
                }
            }
        }
    }
    func testToolbarKeepsButtonsClickableAndBlankEdgesDraggable() {
        let bounds = CGRect(x: 0, y: 0, width: 480, height: 52)
        let buttons = [CGRect(x: 17, y: 11, width: 60, height: 30), CGRect(x: 116, y: 5, width: 248, height: 42), CGRect(x: 403, y: 11, width: 60, height: 30)]
        let areas = WindowMotion.dragAreas(in: bounds, excluding: buttons)
        for area in areas {
            XCTAssertTrue(bounds.contains(area))
            for button in buttons { XCTAssertTrue(area.intersection(button).isEmpty) }
        }
        for point in [CGPoint(x: 5, y: 26), CGPoint(x: 40, y: 3), CGPoint(x: 90, y: 26), CGPoint(x: 475, y: 48)] {
            XCTAssertTrue(areas.contains { $0.contains(point) })
        }
    }
    func testTearThresholdDoesNotDetachOnSmallPullOrUpwardMotion() {
        XCTAssertFalse(WindowMotion.detached(CGPoint(x: 20, y: -50)))
        XCTAssertFalse(WindowMotion.detached(CGPoint(x: 0, y: 150)))
        XCTAssertTrue(WindowMotion.detached(CGPoint(x: 0, y: -112)))
        XCTAssertTrue(WindowMotion.detached(CGPoint(x: -150, y: 0)))
    }
}
