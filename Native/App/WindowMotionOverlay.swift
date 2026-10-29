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
    func setOpacity(_ value: CGFloat) { canvases.forEach { $0.setOpacity(value) } }
    func close() { canvases.forEach { $0.close() } }
    func triangle(tip: CGPoint, base: CGPoint, halfWidth: CGFloat, surface: GlassSurface) {
        canvases.forEach { $0.triangle(tip: tip, base: base, halfWidth: halfWidth, surface: surface) }
    }
    func prepare(image: CGImage, size: CGSize, surface: GlassSurface) { canvases.forEach { $0.prepare(image: image, size: size, surface: surface) } }
    func genie(progress: CGFloat, origin: CGRect, target: CGPoint) {
        canvases.forEach { $0.genie(progress: progress, origin: origin, target: target) }
    }
}

// 独立 Space 会裁剪横跨多个显示器的单一窗口，因此每个屏幕各持有一层。
@MainActor private final class ScreenMotionCanvas {
    let panel: NSPanel
    private let root: CALayer
    private let glass = GlassSurface(frame: .zero)
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
        root = view.layer!; view.addSubview(glass); glass.isHidden = true
        panel.orderFrontRegardless()
    }
    func setOpacity(_ value: CGFloat) { panel.alphaValue = value }
    func close() { panel.orderOut(nil) }
    private func point(_ value: CGPoint) -> CGPoint { CGPoint(x: value.x - panel.frame.minX, y: panel.frame.maxY - value.y) }
    private func rect(_ value: CGRect) -> CGRect { CGRect(x: value.minX - panel.frame.minX, y: panel.frame.maxY - value.maxY, width: value.width, height: value.height) }
    func triangle(tip: CGPoint, base: CGPoint, halfWidth: CGFloat, surface: GlassSurface) {
        let tip = point(tip), base = point(base)
        let frame = CGRect(x: min(tip.x, base.x - halfWidth), y: min(tip.y, base.y),
                           width: max(tip.x, base.x + halfWidth) - min(tip.x, base.x - halfWidth), height: abs(tip.y - base.y))
        guard frame.width > 0, frame.height > 0 else { glass.isHidden = true; return }
        CATransaction.begin(); CATransaction.setDisableActions(true)
        glass.frame = frame; glass.copyAppearance(from: surface); glass.isHidden = false
        glass.customShape = NotePointer.path(tip: CGPoint(x: tip.x-frame.minX, y: frame.maxY-tip.y),
                                             base: CGPoint(x: base.x-frame.minX, y: frame.maxY-base.y), halfWidth: halfWidth)
        glass.layoutSubtreeIfNeeded()
        CATransaction.commit()
    }
    func prepare(image: CGImage, size: CGSize, surface: GlassSurface) {
        imageSize = size
        glass.frame = root.bounds; glass.copyAppearance(from: surface); glass.isHidden = false
        let scale = CGFloat(image.height) / size.height
        // 透明切片共用相同边界，避免重叠像素把半透明按钮叠成深色横线。
        for index in 0..<96 {
            let top = floor(CGFloat(index) * CGFloat(image.height) / 96)
            let bottom = floor(CGFloat(index + 1) * CGFloat(image.height) / 96)
            guard let crop = image.cropping(to: CGRect(x: 0, y: top, width: CGFloat(image.width), height: bottom - top)) else { continue }
            let layer = CALayer(); layer.name = "JotPaperStrip"; layer.anchorPoint = .zero; layer.position = .zero
            // AppKit 会重排子视图图层，正文必须始终位于毛玻璃之上。
            layer.zPosition = 1
            layer.bounds = CGRect(x: 0, y: 0, width: size.width, height: (bottom - top) / scale)
            layer.contents = crop; layer.contentsScale = scale
            root.addSublayer(layer); strips.append((layer, top / scale, (bottom - top) / scale))
        }
    }
    func genie(progress: CGFloat, origin: CGRect, target: CGPoint) {
        let origin = rect(origin); let target = point(target)
        CATransaction.begin(); CATransaction.setDisableActions(true)
        // 连续的毛玻璃轮廓承载透明正文切片，不再给快照垫一层白纸。
        let silhouette = CGMutablePath()
        let rows = (0...96).map { index -> WindowMotion.Row in
            let v = CGFloat(index) / 96
            let row = WindowMotion.row(v, progress: progress, origin: origin, target: target)
            let edge = min(v, 1-v) * imageSize.height
            let inset = edge < 22 ? (22 - sqrt(max(0, 22*22 - pow(22-edge, 2)))) * row.width / imageSize.width : 0
            return WindowMotion.Row(left: row.left + inset, width: max(0, row.width - inset*2), y: row.y)
        }
        silhouette.move(to: CGPoint(x: rows[0].left, y: root.bounds.height - rows[0].y))
        for row in rows.dropFirst() { silhouette.addLine(to: CGPoint(x: row.left, y: root.bounds.height - row.y)) }
        for row in rows.reversed() { silhouette.addLine(to: CGPoint(x: row.left + row.width, y: root.bounds.height - row.y)) }
        silhouette.closeSubpath(); glass.customShape = silhouette; glass.layoutSubtreeIfNeeded()
        let shadow = CGMutablePath()
        shadow.move(to: CGPoint(x: rows[0].left, y: rows[0].y))
        for row in rows.dropFirst() { shadow.addLine(to: CGPoint(x: row.left, y: row.y)) }
        for row in rows.reversed() { shadow.addLine(to: CGPoint(x: row.left + row.width, y: row.y)) }
        shadow.closeSubpath()
        root.shadowPath = shadow; root.shadowColor = NSColor.black.cgColor
        root.shadowOpacity = 0.2 * Float(1 - progress); root.shadowRadius = 12; root.shadowOffset = CGSize(width: 0, height: 4)
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
