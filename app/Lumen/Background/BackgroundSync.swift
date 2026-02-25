import BackgroundTasks
import UIKit
import WebKit

/// Manages background sync tasks for keeping the Git repository up to date.
///
/// Two mechanisms:
/// 1. **BGAppRefreshTask** — iOS wakes the app periodically (typically every 15-30 min)
///    to run a quick sync. We load the web view headlessly and trigger a SYNC event.
/// 2. **UIApplication.beginBackgroundTask** — When the app goes to background, we get
///    ~30 seconds to finish any in-progress sync before iOS suspends us.
final class BackgroundSync {
    static let shared = BackgroundSync()

    static let refreshTaskIdentifier = "com.lumen.app.refresh"

    private var backgroundTaskID: UIBackgroundTaskIdentifier = .invalid

    private init() {}

    // MARK: - Registration

    /// Register the background task identifiers. Call from application(_:didFinishLaunching...).
    func registerTasks() {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: Self.refreshTaskIdentifier,
            using: nil
        ) { task in
            self.handleAppRefresh(task: task as! BGAppRefreshTask)
        }
    }

    // MARK: - Scheduling

    /// Schedule the next background app refresh. Call when entering background.
    func scheduleRefresh() {
        let request = BGAppRefreshTaskRequest(identifier: Self.refreshTaskIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60) // 15 minutes

        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            print("[Lumen] Failed to schedule background refresh: \(error)")
        }
    }

    // MARK: - Background Task (30s window)

    /// Begin a background task to finish an in-progress sync.
    /// Called from the web app via the native bridge when visibilitychange fires.
    func beginBackgroundTask() {
        guard backgroundTaskID == .invalid else { return }

        backgroundTaskID = UIApplication.shared.beginBackgroundTask(withName: "LumenSync") {
            self.endBackgroundTask()
        }

        // Safety: end the task after 25 seconds (iOS gives ~30s, leave margin)
        DispatchQueue.main.asyncAfter(deadline: .now() + 25) {
            self.endBackgroundTask()
        }
    }

    /// End the current background task.
    func endBackgroundTask() {
        guard backgroundTaskID != .invalid else { return }
        UIApplication.shared.endBackgroundTask(backgroundTaskID)
        backgroundTaskID = .invalid
    }

    // MARK: - App Refresh Handler

    private func handleAppRefresh(task: BGAppRefreshTask) {
        // Schedule the next refresh before doing work
        scheduleRefresh()

        task.expirationHandler = {
            task.setTaskCompleted(success: false)
        }

        // Trigger a sync by evaluating JS in the web view.
        // The web view retains its state while the app is suspended.
        DispatchQueue.main.async {
            guard let webView = NativeBridge.shared.webView else {
                task.setTaskCompleted(success: false)
                return
            }

            let js = """
                (function() {
                    try {
                        // Dispatch a custom event the web app listens for
                        window.dispatchEvent(new CustomEvent('lumenbackgroundsync'));
                        return 'ok';
                    } catch(e) {
                        return e.message;
                    }
                })()
            """

            webView.evaluateJavaScript(js) { _, error in
                if let error {
                    print("[Lumen] Background sync JS error: \(error)")
                }
                // Give the web app a few seconds to complete the sync
                DispatchQueue.main.asyncAfter(deadline: .now() + 10) {
                    task.setTaskCompleted(success: error == nil)
                }
            }
        }
    }
}
