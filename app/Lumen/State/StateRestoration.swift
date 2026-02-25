import Foundation

/// Manages state restoration via NSUserActivity so the OS can restore the exact
/// URL the user was viewing when the app was killed.
final class StateRestoration: ObservableObject {
    static let shared = StateRestoration()
    static let activityType = "com.lumen.app.viewing"

    private let urlKey = "lumen_last_url"

    /// A URL that should be navigated to on the next updateUIView cycle.
    /// Set when a notification is tapped or a user activity is restored.
    @Published var pendingURL: String?

    /// The most recently saved URL.
    var savedURL: String? {
        UserDefaults.standard.string(forKey: urlKey)
    }

    private init() {}

    /// Save the current URL for restoration.
    func save(url: String) {
        UserDefaults.standard.set(url, forKey: urlKey)
    }

    /// Restore from an NSUserActivity (called via `.onContinueUserActivity`).
    func restore(from activity: NSUserActivity) {
        guard activity.activityType == Self.activityType,
              let url = activity.userInfo?["url"] as? String
        else { return }
        pendingURL = url
    }

    /// Consume the pending URL (returns it once, then clears).
    func consumePendingURL() -> String? {
        guard let url = pendingURL else { return nil }
        pendingURL = nil
        return url
    }

    /// Create an NSUserActivity representing the current state.
    func makeUserActivity(url: String) -> NSUserActivity {
        let activity = NSUserActivity(activityType: Self.activityType)
        activity.title = "Lumen"
        activity.userInfo = ["url": url]
        activity.isEligibleForHandoff = true
        return activity
    }
}
