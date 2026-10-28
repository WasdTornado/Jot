import Foundation
import CoreGraphics

struct WindowPlacement {
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
