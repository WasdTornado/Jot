import AppKit

/** 从轻叠图标提取纸面与圆点，实心轮廓适合 18 pt 菜单栏。 */
enum StatusIcon {
    static func make() -> NSImage {
        let image = NSImage(size: NSSize(width: 18, height: 18), flipped: true) { _ in
            let transform = NSAffineTransform()
            transform.scale(by: 18.0 / 24.0)
            transform.concat()
            NSColor.black.setStroke()
            NSColor.black.setFill()
            // 只留一道后页边，不把三张纸的全部边线挤进小尺寸。
            let edge = NSBezierPath()
            edge.move(to: NSPoint(x: 5.5, y: 6))
            edge.line(to: NSPoint(x: 3.5, y: 6.5))
            edge.line(to: NSPoint(x: 6, y: 20.5))
            edge.line(to: NSPoint(x: 9, y: 20))
            edge.lineWidth = 1.6
            edge.lineCapStyle = .round
            edge.lineJoinStyle = .round
            edge.stroke()
            let paper = NSBezierPath(roundedRect: NSRect(x: 7, y: 3, width: 13, height: 17), xRadius: 2.5, yRadius: 2.5)
            // 负形圆点是彩色图标中莓色圆点的单色对应。
            paper.appendOval(in: NSRect(x: 9.25, y: 5.75, width: 2.5, height: 2.5))
            paper.windingRule = .evenOdd
            paper.fill()
            return true
        }
        image.isTemplate = true
        image.accessibilityDescription = "Jot · 点页"
        return image
    }
}
