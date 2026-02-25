import UIKit
import UserNotifications

/// Manages push notification registration and local notifications.
final class NotificationManager {
    static let shared = NotificationManager()

    /// The APNS device token, set by AppDelegate after registration.
    var deviceToken: String?

    private init() {}

    /// Request notification permissions and register for remote notifications.
    /// Returns the device token or nil.
    func registerForPushNotifications() async -> String? {
        do {
            let granted = try await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .badge, .sound])

            guard granted else { return nil }

            await MainActor.run {
                UIApplication.shared.registerForRemoteNotifications()
            }

            // Wait briefly for the token to arrive from the delegate callback
            for _ in 0..<20 {
                if let token = deviceToken { return token }
                try? await Task.sleep(nanoseconds: 100_000_000) // 100ms
            }

            return deviceToken
        } catch {
            print("[Lumen] Notification permission error: \(error)")
            return nil
        }
    }

    /// Post a local notification (e.g., when background sync finds new changes).
    func postLocalNotification(title: String, body: String, url: String? = nil) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        if let url {
            content.userInfo["url"] = url
        }

        let request = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: nil // Deliver immediately
        )

        UNUserNotificationCenter.current().add(request)
    }
}
