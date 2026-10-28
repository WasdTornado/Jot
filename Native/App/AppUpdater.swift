import AppKit
import Sparkle

/// 使用 Sparkle 验证签名并安装更新；安装前必须确认所有便签写入成功。
@MainActor final class AppUpdater: NSObject, SPUUpdaterDelegate, NSMenuItemValidation {
    private var controller: SPUStandardUpdaterController!
    private let prepare: () async -> Bool
    private var pendingInstall: (() -> Void)?
    private var preparing = false
    private var started = false
    init(prepare: @escaping () async -> Bool) {
        self.prepare = prepare
        super.init()
        controller = SPUStandardUpdaterController(startingUpdater: false, updaterDelegate: self, userDriverDelegate: nil)
        // 独立验收实例默认不连接正式更新源。
        if ProcessInfo.processInfo.environment["TOT_NOTES_DATA_DIR"] == nil { start() }
    }
    private func start() { guard !started else { return }; controller.startUpdater(); started = true }
    @objc func checkForUpdates(_ sender: Any?) {
        if pendingInstall != nil { resumeInstallation(); return }
        start()
        controller.checkForUpdates(sender)
    }
    @objc func toggleAutomaticChecks(_ sender: Any?) {
        controller.updater.automaticallyChecksForUpdates.toggle()
    }
    func validateMenuItem(_ item: NSMenuItem) -> Bool {
        if item.action == #selector(toggleAutomaticChecks(_:)) {
            item.state = controller.updater.automaticallyChecksForUpdates ? .on : .off
            return true
        }
        item.title = pendingInstall == nil ? "检查更新…" : "保存并继续更新…"
        return !preparing && (pendingInstall != nil || controller.updater.canCheckForUpdates)
    }
    func updater(_ updater: SPUUpdater, shouldPostponeRelaunchForUpdate item: SUAppcastItem, untilInvokingBlock installHandler: @escaping () -> Void) -> Bool {
        pendingInstall = installHandler
        resumeInstallation()
        return true
    }
    private func resumeInstallation() {
        guard !preparing, let install = pendingInstall else { return }
        preparing = true
        Task {
            let saved = await prepare()
            preparing = false
            guard saved else { return }
            pendingInstall = nil
            install()
        }
    }
}
