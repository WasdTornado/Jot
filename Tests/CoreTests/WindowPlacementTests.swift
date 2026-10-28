import XCTest
import CoreGraphics
@testable import TotNotesCore

final class WindowPlacementTests: XCTestCase {
    private let size = CGSize(width: 480, height: 478)
    private let screen = CGRect(x: 0, y: 0, width: 1470, height: 956)
    private let visible = CGRect(x: 0, y: 0, width: 1470, height: 919)

    func testTransientStartupAnchorMustNotProduceADesktopWindow() {
        // 真实冷启动捕获：按钮已有宽高，但屏幕坐标还没完成布局。
        for anchor in [nil, CGRect.zero, CGRect(x: 8, y: -13.5, width: 22, height: 27), CGRect(x: 500, y: 400, width: 22, height: 27)] {
            XCTAssertNil(WindowPlacement.frame(anchor: anchor, screen: screen, visible: visible, size: size))
        }
    }
    func testMenuBarAnchorCentersWindowOnItsIcon() throws {
        let frame = try XCTUnwrap(WindowPlacement.frame(anchor: CGRect(x: 1038, y: 926, width: 22, height: 27), screen: screen, visible: visible, size: size))
        XCTAssertEqual(frame.midX, 1049); XCTAssertEqual(frame.maxY, 919)
        XCTAssertTrue(visible.contains(frame))
    }
    func testFreshAnchorMovesWindowAfterMenuBarRelayout() throws {
        let first = try XCTUnwrap(WindowPlacement.frame(anchor: CGRect(x: 1038, y: 926, width: 22, height: 27), screen: screen, visible: visible, size: size))
        let second = try XCTUnwrap(WindowPlacement.frame(anchor: CGRect(x: 1026, y: 926, width: 22, height: 27), screen: screen, visible: visible, size: size))
        XCTAssertEqual(second.minX, first.minX - 12)
        XCTAssertEqual(second.maxY, first.maxY)
    }
    func testScreenEdgeKeepsWindowVisibleAndPointerNearIcon() throws {
        let anchor = CGRect(x: 1300, y: 926, width: 22, height: 27)
        let frame = try XCTUnwrap(WindowPlacement.frame(anchor: anchor, screen: screen, visible: visible, size: size))
        XCTAssertTrue(visible.contains(frame))
        XCTAssertEqual(frame.minX + WindowPlacement.pointerX(anchor: anchor, frame: frame), anchor.midX)
        XCTAssertNotEqual(WindowPlacement.pointerX(anchor: anchor, frame: frame), frame.width / 2)
    }
    func testSecondaryDisplayUsesItsOwnMenuBarAndCoordinateOrigin() throws {
        let other = CGRect(x: -1920, y: -1080, width: 1920, height: 1080)
        let usable = CGRect(x: -1920, y: -1080, width: 1920, height: 1056)
        let anchor = CGRect(x: -700, y: -24, width: 22, height: 24)
        XCTAssertNil(WindowPlacement.frame(anchor: anchor, screen: screen, visible: visible, size: size))
        let frame = try XCTUnwrap(WindowPlacement.frame(anchor: anchor, screen: other, visible: usable, size: size))
        XCTAssertEqual(frame.midX, -689); XCTAssertEqual(frame.maxY, -24)
        XCTAssertTrue(usable.contains(frame))
    }
    func testRememberedLargeSizeIsClampedToSmallScreen() throws {
        let smallScreen = CGRect(x: 0, y: 0, width: 800, height: 600)
        let usable = CGRect(x: 0, y: 0, width: 800, height: 576)
        let anchor = CGRect(x: 700, y: 576, width: 22, height: 24)
        let frame = try XCTUnwrap(WindowPlacement.frame(anchor: anchor, screen: smallScreen, visible: usable, size: CGSize(width: 900, height: 1000)))
        XCTAssertEqual(frame.width, 784); XCTAssertEqual(frame.height, 560)
        XCTAssertTrue(usable.contains(frame)); XCTAssertEqual(frame.maxY, 576)
    }
    func testAutoHiddenMenuBarCanOverlapVisibleScreenArea() throws {
        let frame = try XCTUnwrap(WindowPlacement.frame(anchor: CGRect(x: 1038, y: 926, width: 22, height: 27), screen: screen, visible: screen, size: size))
        XCTAssertEqual(frame.maxY, 926)
    }
}
