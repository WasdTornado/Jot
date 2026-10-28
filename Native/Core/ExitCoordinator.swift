import Foundation

@MainActor final class ExitCoordinator {
    private let flush: () async throws -> Void
    private var pending: Task<Bool, Never>?
    init(flush: @escaping () async throws -> Void) { self.flush = flush }

    func flushBeforeClosing(timeout: Duration = .seconds(3)) async -> Bool {
        if let pending { return await pending.value }
        let task = Task { await performFlush(timeout: timeout) }
        pending = task
        let result = await task.value
        pending = nil
        return result
    }

    private func performFlush(timeout: Duration) async -> Bool {
        return await withCheckedContinuation { continuation in
            var finished = false
            var timer: Task<Void, Never>?
            func finish(_ success: Bool) {
                guard !finished else { return }
                finished = true; timer?.cancel(); continuation.resume(returning: success)
            }
            Task { do { try await flush(); finish(true) } catch { finish(false) } }
            timer = Task {
                do { try await Task.sleep(for: timeout); finish(false) } catch { }
            }
        }
    }
}
