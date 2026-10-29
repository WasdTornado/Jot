import Foundation
import CoreGraphics

struct WindowPlacement {
    static func floating(frame: CGRect, screens: [CGRect]) -> CGRect? {
        guard [frame.minX, frame.minY, frame.width, frame.height].allSatisfy(\.isFinite),
              frame.width > 0, frame.height > 0 else { return nil }
        let available = screens.filter { !$0.isEmpty && !$0.isInfinite && !$0.isNull }
        // 优先保留窗口所在屏幕；屏幕断开时，选距离最近的可见屏幕。
        guard let screen = available.max(by: { a, b in
            let overlapA = frame.intersection(a), overlapB = frame.intersection(b)
            let areaA = overlapA.isNull ? 0 : overlapA.width * overlapA.height
            let areaB = overlapB.isNull ? 0 : overlapB.width * overlapB.height
            if areaA != areaB { return areaA < areaB }
            return hypot(frame.midX - a.midX, frame.midY - a.midY) > hypot(frame.midX - b.midX, frame.midY - b.midY)
        }) else { return nil }
        let margin = min(8, min(screen.width, screen.height) / 4)
        let width = min(frame.width, screen.width - margin * 2)
        let height = min(frame.height, screen.height - margin * 2)
        return CGRect(x: min(max(frame.minX, screen.minX + margin), screen.maxX - width - margin),
                      y: min(max(frame.minY, screen.minY + margin), screen.maxY - height - margin), width: width, height: height)
    }

    static func corner(_ corner: String, screen: CGRect, size: CGSize) -> CGRect? {
        guard ["topLeft", "topRight", "bottomLeft", "bottomRight"].contains(corner) else { return nil }
        let frame = CGRect(x: corner.hasSuffix("Right") ? screen.maxX - size.width - 8 : screen.minX + 8,
                           y: corner.hasPrefix("top") ? screen.maxY - size.height - 8 : screen.minY + 8,
                           width: size.width, height: size.height)
        return floating(frame: frame, screens: [screen])
    }

    static func frame(anchor: CGRect?, screen: CGRect, visible: CGRect, size: CGSize) -> CGRect? {
        // 宽高非零不代表屏幕坐标已经就绪：启动时会出现 (8, -13.5, 22, 27)。
        // 只接受对应显示器顶部菜单栏范围的图标，缺失时由调用方等待下一次布局。
        guard let anchor, anchor.width > 0, anchor.height > 0,
              [anchor.minX, anchor.minY, anchor.width, anchor.height].allSatisfy(\.isFinite),
              anchor.midX >= screen.minX, anchor.midX <= screen.maxX,
              anchor.midY >= screen.maxY - max(48, anchor.height),
              anchor.maxY <= screen.maxY + 1 else { return nil }
        let width = min(size.width, max(1, visible.width - 16))
        let height = min(size.height, max(1, visible.height - 16))
        let x = min(max(anchor.midX - width / 2, visible.minX + 8), visible.maxX - width - 8)
        let y = min(max(anchor.minY - height, visible.minY + 8), visible.maxY - height)
        return CGRect(x: x, y: y, width: width, height: height)
    }

    static func pointerX(anchor: CGRect, frame: CGRect) -> CGFloat {
        // 窗口为避让屏幕边缘横移时，指向角仍尽量对准菜单栏图标。
        min(max(anchor.midX - frame.minX, 32), frame.width - 32)
    }
}
