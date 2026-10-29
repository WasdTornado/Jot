import AppKit

final class NotePanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

// 静止尖角和拖拽连接共用曲线，肩部水平接入纸张，顶端保留轻微圆角。
enum NotePointer {
    static func path(tip: CGPoint, base: CGPoint, halfWidth w: CGFloat) -> CGPath {
        let h = tip.y - base.y
        let path = CGMutablePath()
        path.move(to: CGPoint(x: base.x - w, y: base.y))
        path.addCurve(to: CGPoint(x: tip.x - w * 0.2, y: base.y + h * 0.9),
                      control1: CGPoint(x: base.x - w * 0.55, y: base.y),
                      control2: CGPoint(x: tip.x - w * 0.38, y: base.y + h * 0.84))
        path.addCurve(to: CGPoint(x: tip.x + w * 0.2, y: base.y + h * 0.9),
                      control1: CGPoint(x: tip.x - w * 0.08, y: tip.y + h * 0.03),
                      control2: CGPoint(x: tip.x + w * 0.08, y: tip.y + h * 0.03))
        path.addCurve(to: CGPoint(x: base.x + w, y: base.y),
                      control1: CGPoint(x: tip.x + w * 0.38, y: base.y + h * 0.84),
                      control2: CGPoint(x: base.x + w * 0.55, y: base.y))
        path.closeSubpath()
        return path
    }
}

@MainActor final class GlassSurface: NSView {
    let material = NSVisualEffectView()
    private let tint = NSView()
    private(set) var paperColor = NSColor(calibratedRed: 249/255, green: 245/255, blue: 243/255, alpha: 1)
    var customShape: CGPath? { didSet { needsLayout = true } }
    private var appearanceSettings = (solid: false, dark: false, skin: "default", pageID: "page-1")
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
        if let customShape {
            let mask = CAShapeLayer(); mask.frame = bounds; mask.path = customShape
            material.maskImage = nil; layer?.mask = mask
            return
        }
        let shape = NSBezierPath(roundedRect: NSRect(x: 0, y: 0, width: bounds.width, height: bounds.height - 10), xRadius: 22, yRadius: 22)
        let middle = pointerX ?? bounds.midX
        if showsPointer {
            let pointer = NotePointer.path(tip: CGPoint(x: middle, y: bounds.height - 10 + pointerHeight),
                                           base: CGPoint(x: middle, y: bounds.height - 11), halfWidth: pointerHeight * 1.4)
            // 与圆角主体同向填充，重叠处不产生透明缝。
            shape.append(NSBezierPath(cgPath: pointer).reversed)
        }
        let image = NSImage(size: bounds.size, flipped: false) { _ in NSColor.white.setFill(); shape.fill(); return true }
        material.maskImage = image
        // 同一轮廓同时约束网页和系统材质，指向角不单独叠一片玻璃。
        let mask = CALayer(); mask.frame = bounds; mask.contents = image; layer?.mask = mask
    }
    func copyAppearance(from source: GlassSurface) {
        let value = source.appearanceSettings
        setSolid(value.solid, dark: value.dark, skin: value.skin, pageID: value.pageID)
    }
    func setSolid(_ solid: Bool, dark: Bool, skin: String = "default", pageID: String = "page-1") {
        appearanceSettings = (solid, dark, skin, pageID)
        // 所有皮肤共用系统毛玻璃，只改变纸张染色；纯色模式仍保留可读性兜底。
        let colors: [String: (Int, Int)] = ["grid": (0xfafbf6, 0x252e32), "cream": (0xfff8e9, 0x322d25), "marker": (0xfdfcf8, 0x292d29), "mint": (0xf0f7ee, 0x25342d), "sakura": (0xfff3f4, 0x392a34), "manuscript": (0xf6eddb, 0x332e25), "sea": (0xf0f7fb, 0x202e3c)]
        let pair = colors[skin] ?? (0xf9f5f3, 0x2c282b)
        let value = dark ? pair.1 : pair.0
        paperColor = NSColor(calibratedRed: CGFloat((value >> 16) & 255) / 255, green: CGFloat((value >> 8) & 255) / 255, blue: CGFloat(value & 255) / 255, alpha: 1)
        if skin == "default" {
            // page-1 是日常页，视觉顺序与存储编号不同。
            let light = [0xb74760, 0xb58d29, 0xbd7647, 0x9a78ac, 0x87838c, 0x438b98, 0x758d5d]
            let night = [0xe69ab1, 0xdfbd67, 0xe5a779, 0xbba6d0, 0xb9b4c1, 0x8ac1c9, 0xb3c59a]
            let index = min(6, max(0, (Int(pageID.split(separator: "-").last ?? "1") ?? 1) - 1))
            let rgb = (dark ? night : light)[index]
            let accent = NSColor(srgbRed: CGFloat((rgb >> 16) & 255)/255, green: CGFloat((rgb >> 8) & 255)/255, blue: CGFloat(rgb & 255)/255, alpha: 1)
            let base = dark ? NSColor(srgbRed: 39/255, green: 40/255, blue: 44/255, alpha: 1) : NSColor(srgbRed: 250/255, green: 248/255, blue: 243/255, alpha: 1)
            paperColor = base.blended(withFraction: dark ? 0.14 : 0.12, of: accent) ?? base
        }
        material.appearance = NSAppearance(named: dark ? .darkAqua : .aqua)
        material.isHidden = solid
        tint.layer?.backgroundColor = paperColor.withAlphaComponent(solid ? 1 : (skin == "default" ? 0.45 : (dark ? 0.32 : 0.24))).cgColor
        layer?.backgroundColor = solid ? paperColor.cgColor : NSColor.clear.cgColor
    }
}
