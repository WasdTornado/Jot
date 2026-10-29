import AppKit

// 透明热区只接收顶部空白处的事件，正文和工具按钮仍交给网页。
@MainActor final class WindowDragHandle: NSView {
    var areas: [CGRect] = []
    var onDragStart: (() -> Void)?
    var onDrag: ((CGPoint) -> Void)?
    var onDragEnd: (() -> Void)?
    var onPlace: ((String) -> Void)?
    var onNudge: ((CGFloat, CGFloat) -> Void)?
    var onReturnToEditor: (() -> Void)?
    private var start: CGPoint?
    private var moving = false
    override var acceptsFirstResponder: Bool { true }
    override init(frame: NSRect) {
        super.init(frame: frame)
        toolTip = "拖动便签 · 右键选择位置"
        setAccessibilityElement(true); setAccessibilityRole(.button)
        setAccessibilityLabel("移动便签")
        setAccessibilityHelp("拖动顶部空白处；方向键微调，Shift 加速，Escape 返回正文")
    }
    required init?(coder: NSCoder) { fatalError("不支持解码") }
    override func hitTest(_ point: NSPoint) -> NSView? {
        guard !isHidden, areas.contains(where: { $0.contains(convert(point, from: superview)) }) else { return nil }
        return self
    }
    override func resetCursorRects() { for area in areas { addCursorRect(area, cursor: .openHand) } }
    override func mouseDown(with event: NSEvent) { start = window?.convertPoint(toScreen: event.locationInWindow) }
    override func mouseDragged(with event: NSEvent) {
        guard let start else { return }
        guard let point = window?.convertPoint(toScreen: event.locationInWindow) else { return }
        let delta = CGPoint(x: point.x - start.x, y: point.y - start.y)
        if !moving {
            guard hypot(delta.x, delta.y) >= 4 else { return }
            moving = true; NSCursor.closedHand.push(); onDragStart?()
        }
        onDrag?(delta)
    }
    override func mouseUp(with event: NSEvent) {
        start = nil
        if moving { moving = false; NSCursor.pop(); onDragEnd?() }
    }
    override func rightMouseDown(with event: NSEvent) { showPositions() }
    @objc private func showPositions() {
        window?.makeFirstResponder(self)
        let menu = NSMenu()
        for (label, value) in [("移到左上角", "topLeft"), ("移到右上角", "topRight"), ("移到左下角", "bottomLeft"), ("移到右下角", "bottomRight"), ("回到菜单栏下方", "anchor")] {
            if value == "anchor" { menu.addItem(.separator()) }
            let item = NSMenuItem(title: label, action: #selector(place(_:)), keyEquivalent: "")
            item.target = self; item.representedObject = value; menu.addItem(item)
        }
        menu.popUp(positioning: nil, at: NSPoint(x: bounds.midX, y: 0), in: self)
    }
    @objc private func place(_ item: NSMenuItem) { if let value = item.representedObject as? String { onPlace?(value) } }
    override func keyDown(with event: NSEvent) {
        let modifiers = event.modifierFlags.intersection([.command, .option, .control, .shift])
        guard modifiers.isSubset(of: [.shift]) else { super.keyDown(with: event); return }
        let step: CGFloat = modifiers.contains(.shift) ? 40 : 10
        switch event.keyCode {
        case 123: onNudge?(-step, 0)
        case 124: onNudge?(step, 0)
        case 125: onNudge?(0, -step)
        case 126: onNudge?(0, step)
        case 36, 49: showPositions()
        case 53: onReturnToEditor?()
        default: super.keyDown(with: event)
        }
    }
}
