import AppKit
import QuartzCore

private final class MotionCanvas: NSView {
    override var isFlipped: Bool { true }
}
private final class MotionPanel: NSPanel {
    override func constrainFrameRect(_ frameRect: NSRect, to screen: NSScreen?) -> NSRect { frameRect }
}

// 超出真实窗口边界的连接与纸张快照放在独立透明层，编辑器始终保留原实例。
@MainActor final class WindowMotionOverlay {
    private let canvases: [ScreenMotionCanvas]
    init(level: NSWindow.Level) { canvases = NSScreen.screens.map { ScreenMotionCanvas(screen: $0, level: level) } }
    func close() { canvases.forEach { $0.close() } }
    func triangle(tip: CGPoint, base: CGPoint, halfWidth: CGFloat, color: NSColor) {
        canvases.forEach { $0.triangle(tip: tip, base: base, halfWidth: halfWidth, color: color) }
    }
    func prepare(image: CGImage, size: CGSize) { canvases.forEach { $0.prepare(image: image, size: size) } }
    func genie(progress: CGFloat, origin: CGRect, target: CGPoint) {
        canvases.forEach { $0.genie(progress: progress, origin: origin, target: target) }
    }
}

// 独立 Space 会裁剪横跨多个显示器的单一窗口，因此每个屏幕各持有一层。
@MainActor private final class ScreenMotionCanvas {
    let panel: NSPanel
    private let root: CALayer
    private let connection = CAShapeLayer()
    private var strips: [(layer: CALayer, top: CGFloat, height: CGFloat)] = []
    private var imageSize = CGSize.zero

    init(screen: NSScreen, level: NSWindow.Level) {
        let frame = screen.frame
        panel = MotionPanel(contentRect: frame, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.identifier = NSUserInterfaceItemIdentifier("JotMotion")
        panel.isOpaque = false; panel.backgroundColor = .clear; panel.hasShadow = false
        panel.ignoresMouseEvents = true; panel.hidesOnDeactivate = false; panel.isReleasedWhenClosed = false
        panel.setAccessibilityElement(false)
        panel.level = NSWindow.Level(rawValue: max(level.rawValue, NSWindow.Level.floating.rawValue) + 1)
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
        // 由翻转视图管理根图层；AppKit 会重设手工 layer 的方向，导致内容画到屏幕外。
        let view = MotionCanvas(frame: CGRect(origin: .zero, size: frame.size))
        view.wantsLayer = true; panel.contentView = view
        root = view.layer!; root.addSublayer(connection)
        panel.orderFrontRegardless()
    }
    func close() { panel.orderOut(nil) }
    private func point(_ value: CGPoint) -> CGPoint { CGPoint(x: value.x - panel.frame.minX, y: panel.frame.maxY - value.y) }
    private func rect(_ value: CGRect) -> CGRect { CGRect(x: value.minX - panel.frame.minX, y: panel.frame.maxY - value.maxY, width: value.width, height: value.height) }
    func triangle(tip: CGPoint, base: CGPoint, halfWidth: CGFloat, color: NSColor) {
        let path = CGMutablePath(); path.move(to: point(tip))
        path.addLine(to: point(CGPoint(x: base.x - halfWidth, y: base.y)))
        path.addLine(to: point(CGPoint(x: base.x + halfWidth, y: base.y))); path.closeSubpath()
        CATransaction.begin(); CATransaction.setDisableActions(true)
        connection.path = path; connection.fillColor = color.cgColor
        CATransaction.commit()
    }
    func prepare(image: CGImage, size: CGSize) {
        connection.isHidden = true; imageSize = size
        let scale = CGFloat(image.height) / size.height
        // 共享边缘像素覆盖亚像素舍入缝隙；每帧只更新变换，不重绘正文。
        for index in 0..<96 {
            let top = floor(CGFloat(index) * CGFloat(image.height) / 96)
            let bottom = min(CGFloat(image.height), ceil(CGFloat(index + 1) * CGFloat(image.height) / 96) + 1)
            guard let crop = image.cropping(to: CGRect(x: 0, y: top, width: CGFloat(image.width), height: bottom - top)) else { continue }
            let layer = CALayer(); layer.anchorPoint = .zero; layer.position = .zero
            layer.bounds = CGRect(x: 0, y: 0, width: size.width, height: (bottom - top) / scale)
            layer.contents = crop; layer.contentsScale = scale
            root.addSublayer(layer); strips.append((layer, top / scale, (bottom - top) / scale))
        }
    }
    func genie(progress: CGFloat, origin: CGRect, target: CGPoint) {
        let origin = rect(origin); let target = point(target)
        CATransaction.begin(); CATransaction.setDisableActions(true)
        for strip in strips {
            let upper = WindowMotion.row(strip.top / imageSize.height, progress: progress, origin: origin, target: target)
            let lower = WindowMotion.row((strip.top + strip.height) / imageSize.height, progress: progress, origin: origin, target: target)
            let ratio = upper.width / lower.width
            var transform = CATransform3DIdentity
            transform.m11 = upper.width / imageSize.width
            transform.m21 = (lower.left * ratio - upper.left) / strip.height
            transform.m22 = (lower.y * ratio - upper.y) / strip.height
            transform.m24 = (ratio - 1) / strip.height
            transform.m41 = upper.left; transform.m42 = upper.y
            strip.layer.transform = transform
        }
        CATransaction.commit()
    }
}
