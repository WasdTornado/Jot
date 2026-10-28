import Foundation

@MainActor final class WindowVisibilityCoordinator {
    private var wantsVisible = true
    private var pendingFlush: Task<Bool, Never>?
    func shown() { wantsVisible = true }
    func hide(flush: @escaping () async -> Bool, perform: () -> Void) async {
        wantsVisible = false
        // 相邻隐藏请求共用一次保存，但显示操作立即取消过期的隐藏意图。
        let task: Task<Bool, Never>
        if let pendingFlush { task = pendingFlush }
        else { task = Task { await flush() }; pendingFlush = task }
        let saved = await task.value
        pendingFlush = nil
        if saved && !wantsVisible { perform() }
    }
}
