import Foundation

struct UsageEvent: Encodable, Equatable {
    let installation_id: String
    let date: String
    let version: String
    let event = "active_install"
    static func day(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "Asia/Shanghai")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
}

@MainActor final class UsageStatistics {
    private let defaults: UserDefaults
    private let endpoint: URL?
    private let version: String
    private let send: (URLRequest) async throws -> Int
    private var task: Task<Void, Never>?
    private var generation = 0
    private var nextAttempt = Date.distantPast
    private var enabled = false
    init(defaults: UserDefaults = .standard, endpoint: URL?, version: String,
         send: @escaping (URLRequest) async throws -> Int = { request in
             let configuration = URLSessionConfiguration.ephemeral
             configuration.httpCookieStorage = nil
             configuration.urlCache = nil
             let session = URLSession(configuration: configuration)
             defer { session.invalidateAndCancel() }
             let (_, response) = try await session.data(for: request)
             return (response as? HTTPURLResponse)?.statusCode ?? 0
         }) {
        self.defaults = defaults
        self.endpoint = endpoint?.scheme == "https" && endpoint?.host != nil ? endpoint : nil
        self.version = version; self.send = send
    }
    func setEnabled(_ value: Bool) {
        guard enabled != value else { return }
        enabled = value; generation += 1; task?.cancel(); task = nil; nextAttempt = .distantPast
    }
    func recordActivity(now: Date = Date()) {
        let day = UsageEvent.day(now)
        guard enabled, let endpoint, task == nil, now >= nextAttempt,
              defaults.string(forKey: "usage.lastDay") != day else { return }
        let identifier = defaults.string(forKey: "usage.installationID") ?? UUID().uuidString.lowercased()
        defaults.set(identifier, forKey: "usage.installationID")
        let event = UsageEvent(installation_id: identifier, date: day, version: version)
        guard let data = try? JSONEncoder().encode(event) else { return }
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"; request.httpBody = data; request.timeoutInterval = 8
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Jot", forHTTPHeaderField: "User-Agent")
        nextAttempt = now.addingTimeInterval(60)
        let current = generation
        task = Task { [weak self, send] in
            let status = try? await send(request)
            guard let self, self.generation == current, !Task.isCancelled else { return }
            // 只在服务端确认后记为已上报；失败由下一次真实操作触发重试，不启动后台轮询。
            if let status, (200..<300).contains(status) { self.defaults.set(day, forKey: "usage.lastDay") }
            self.task = nil
        }
    }
    func waitForPending() async { await task?.value }
}
