import AppKit

/** 加载反馈由原生视图提供，即使网页或内容进程没有运行也能重试。 */
@MainActor final class EditorLoadView: NSView {
    private let title = NSTextField(labelWithString: "正在打开便签…")
    private let detail = NSTextField(wrappingLabelWithString: "内容保存在这台 Mac")
    private let retry = NSButton(title: "重新加载编辑区", target: nil, action: nil)
    var onRetry: (() -> Void)?
    override init(frame: NSRect) {
        super.init(frame:frame); wantsLayer = true
        title.font = .systemFont(ofSize:16,weight:.medium)
        detail.font = .systemFont(ofSize:12); detail.textColor = .secondaryLabelColor; detail.alignment = .center
        retry.target = self; retry.action = #selector(reload); retry.bezelStyle = .rounded
        let stack = NSStackView(views:[title,detail,retry]); stack.orientation = .vertical; stack.spacing = 14
        stack.translatesAutoresizingMaskIntoConstraints = false; addSubview(stack)
        NSLayoutConstraint.activate([stack.centerXAnchor.constraint(equalTo:centerXAnchor),stack.centerYAnchor.constraint(equalTo:centerYAnchor),stack.widthAnchor.constraint(lessThanOrEqualTo:widthAnchor,constant:-48),detail.widthAnchor.constraint(lessThanOrEqualToConstant:280)])
        showFailure(nil)
    }
    required init?(coder:NSCoder) { fatalError("不支持解码") }
    override func updateLayer() { layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor }
    func showFailure(_ message: String?) {
        isHidden = false; title.stringValue = message == nil ? "正在打开便签…" : "编辑区暂时无法打开"
        detail.stringValue = message ?? "内容保存在这台 Mac"; retry.isHidden = message == nil
    }
    @objc private func reload() { onRetry?() }
}
