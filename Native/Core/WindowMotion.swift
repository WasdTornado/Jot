import Foundation

enum WindowMotion {
    struct Row {
        let left: CGFloat
        let width: CGFloat
        let y: CGFloat
    }

    // 顶边先收拢，底边随后跟进；吸入和展开共用同一条曲面，避免中途跳帧。
    static func row(_ fraction: CGFloat, progress: CGFloat, origin: CGRect, target: CGPoint) -> Row {
        let leadingFraction = target.y > origin.maxY ? 1 - fraction : fraction
        let t = max(0, min(1, (progress - 0.26 * leadingFraction) / 0.74))
        let pull = t * t * t * (t * (t * 6 - 15) + 10)
        let width = origin.width + (18 - origin.width) * pull
        let center = origin.midX + (target.x - origin.midX) * pull
        let y = origin.minY + origin.height * fraction
        // 跨屏目标落在纸张高度范围内时，纵向同步收拢，避免折回和上下翻面。
        let vertical = target.y > origin.minY && target.y < origin.maxY ? progress : pull
        return Row(left: center - width / 2, width: width, y: y + (target.y - y) * vertical)
    }

    static func detached(_ delta: CGPoint) -> Bool { -delta.y >= 112 || abs(delta.x) >= 150 }

    // 把按钮所在的区域从顶部热区扣除，抓手不会覆盖交互控件。
    static func dragAreas(in bounds: CGRect, excluding controls: [CGRect]) -> [CGRect] {
        var areas = [bounds]
        for control in controls where control.intersects(bounds) {
            areas = areas.flatMap { area -> [CGRect] in
                guard area.intersects(control) else { return [area] }
                let hole = area.intersection(control)
                return [CGRect(x: area.minX, y: area.minY, width: area.width, height: hole.minY - area.minY),
                        CGRect(x: area.minX, y: hole.maxY, width: area.width, height: area.maxY - hole.maxY),
                        CGRect(x: area.minX, y: hole.minY, width: hole.minX - area.minX, height: hole.height),
                        CGRect(x: hole.maxX, y: hole.minY, width: area.maxX - hole.maxX, height: hole.height)]
                    .filter { $0.width > 0 && $0.height > 0 }
            }
        }
        return areas
    }
}
