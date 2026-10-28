import AppKit

final class NotePanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

@MainActor final class GlassSurface: NSView {
    let material = NSVisualEffectView()
    private let tint = NSView()
    var pointerX: CGFloat? { didSet { if pointerX != oldValue { needsLayout = true } } }
    override init(frame: NSRect) {
        super.init(frame: frame)
        material.material = .popover; material.blendingMode = .behindWindow; material.state = .active
        material.autoresizingMask = [.width, .height]; material.frame = bounds; addSubview(material)
        tint.frame = bounds; tint.autoresizingMask = [.width, .height]; tint.wantsLayer = true
        addSubview(tint); wantsLayer = true
    }
    required init?(coder: NSCoder) { fatalError("不支持解码") }
    override func layout() {
        super.layout()
        let shape = NSBezierPath(roundedRect: NSRect(x: 0, y: 0, width: bounds.width, height: bounds.height - 10), xRadius: 22, yRadius: 22)
        let middle = pointerX ?? bounds.midX
        shape.move(to: NSPoint(x: middle - 10, y: bounds.height - 10))
        shape.line(to: NSPoint(x: middle, y: bounds.height))
        shape.line(to: NSPoint(x: middle + 10, y: bounds.height - 10)); shape.close()
        let image = NSImage(size: bounds.size, flipped: false) { _ in NSColor.white.setFill(); shape.fill(); return true }
        material.maskImage = image
        // 同一轮廓同时约束网页和系统材质，指向角不单独叠一片玻璃。
        let mask = CALayer(); mask.frame = bounds; mask.contents = image; layer?.mask = mask
    }
    func setSolid(_ solid: Bool, dark: Bool) {
        material.isHidden = solid
        tint.layer?.backgroundColor = (dark ? NSColor(calibratedRed: 44/255, green: 40/255, blue: 43/255, alpha: 0.95) : NSColor(calibratedRed: 249/255, green: 245/255, blue: 243/255, alpha: 0.86)).cgColor
        layer?.backgroundColor = solid ? (dark ? NSColor(calibratedRed: 44/255, green: 40/255, blue: 43/255, alpha: 1) : NSColor(calibratedRed: 249/255, green: 245/255, blue: 243/255, alpha: 1)).cgColor : NSColor.clear.cgColor
    }
}
