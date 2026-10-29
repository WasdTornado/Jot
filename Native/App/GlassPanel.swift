import AppKit

final class NotePanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

@MainActor final class GlassSurface: NSView {
    let material = NSVisualEffectView()
    private let tint = NSView()
    private(set) var paperColor = NSColor(calibratedRed: 249/255, green: 245/255, blue: 243/255, alpha: 1)
    var pointerHeight: CGFloat = 10 { didSet { needsLayout = true } }
    var showsPointer = true { didSet { if showsPointer != oldValue { needsLayout = true } } }
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
        if showsPointer {
            // 与圆角主体保持相同绕向，重叠区域才不会被挖成透明接缝。
            shape.move(to: NSPoint(x: middle + pointerHeight, y: bounds.height - 11))
            shape.line(to: NSPoint(x: middle, y: bounds.height - 10 + pointerHeight))
            shape.line(to: NSPoint(x: middle - pointerHeight, y: bounds.height - 11)); shape.close()
        }
        let image = NSImage(size: bounds.size, flipped: false) { _ in NSColor.white.setFill(); shape.fill(); return true }
        material.maskImage = image
        // 同一轮廓同时约束网页和系统材质，指向角不单独叠一片玻璃。
        let mask = CALayer(); mask.frame = bounds; mask.contents = image; layer?.mask = mask
    }
    func setSolid(_ solid: Bool, dark: Bool, skin: String = "default") {
        // 指向菜单栏的小尖角和网页纸张共用配色，避免换肤后出现拼接色差。
        if skin != "default" {
            let colors: [String: (Int, Int)] = ["grid": (0xfafbf6, 0x252e32), "cream": (0xfff8e9, 0x322d25), "marker": (0xfdfcf8, 0x292d29), "mint": (0xf0f7ee, 0x25342d), "sakura": (0xfff3f4, 0x392a34), "manuscript": (0xf6eddb, 0x332e25), "sea": (0xf0f7fb, 0x202e3c)]
            let pair = colors[skin] ?? (0xf9f5f3, 0x2c282b)
            let value = dark ? pair.1 : pair.0
            let color = NSColor(calibratedRed: CGFloat((value >> 16) & 255) / 255, green: CGFloat((value >> 8) & 255) / 255, blue: CGFloat(value & 255) / 255, alpha: 1)
            paperColor = color
            material.isHidden = true; tint.layer?.backgroundColor = color.cgColor; layer?.backgroundColor = color.cgColor
            return
        }
        material.isHidden = solid
        paperColor = dark ? NSColor(calibratedRed: 44/255, green: 40/255, blue: 43/255, alpha: 1) : NSColor(calibratedRed: 249/255, green: 245/255, blue: 243/255, alpha: 1)
        tint.layer?.backgroundColor = (dark ? NSColor(calibratedRed: 44/255, green: 40/255, blue: 43/255, alpha: 0.95) : NSColor(calibratedRed: 249/255, green: 245/255, blue: 243/255, alpha: 0.86)).cgColor
        layer?.backgroundColor = solid ? (dark ? NSColor(calibratedRed: 44/255, green: 40/255, blue: 43/255, alpha: 1) : NSColor(calibratedRed: 249/255, green: 245/255, blue: 243/255, alpha: 1)).cgColor : NSColor.clear.cgColor
    }
}
