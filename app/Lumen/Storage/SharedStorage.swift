import Foundation

/// Shared storage using the app group container.
///
/// Used for:
/// - Communication between the main app and share extension
/// - Persistent key-value storage that survives web view data clearing
final class SharedStorage {
    /// The app group identifier. Must match the entitlements.
    static let appGroupIdentifier = "group.com.lumen.app"

    private static let pendingSharesKey = "pendingShares"

    private static var sharedDefaults: UserDefaults? {
        UserDefaults(suiteName: appGroupIdentifier)
    }

    // MARK: - Key-Value Storage

    static func setValue(_ value: String, forKey key: String) {
        sharedDefaults?.set(value, forKey: "kv_\(key)")
    }

    static func getValue(forKey key: String) -> String? {
        sharedDefaults?.string(forKey: "kv_\(key)")
    }

    static func removeValue(forKey key: String) {
        sharedDefaults?.removeObject(forKey: "kv_\(key)")
    }

    // MARK: - Share Extension Items

    /// A shared item received from the share extension.
    struct SharedItem: Codable {
        let type: String // "text", "url"
        let value: String
        let timestamp: Date

        func toJSON() -> [String: Any] {
            [
                "type": type,
                "value": value,
                "timestamp": timestamp.timeIntervalSince1970 * 1000, // JS-style ms
            ]
        }
    }

    /// Add a shared item (called from the share extension).
    static func addSharedItem(_ item: SharedItem) {
        var items = loadPendingShares()
        items.append(item)
        savePendingShares(items)
    }

    /// Process and return all pending shared items.
    static func processPendingShares(completion: @escaping ([SharedItem]) -> Void) {
        let items = loadPendingShares()
        completion(items)
    }

    /// Clear all pending shared items.
    static func clearPendingShares() {
        sharedDefaults?.removeObject(forKey: pendingSharesKey)
    }

    // MARK: - Private

    private static func loadPendingShares() -> [SharedItem] {
        guard let data = sharedDefaults?.data(forKey: pendingSharesKey) else { return [] }
        return (try? JSONDecoder().decode([SharedItem].self, from: data)) ?? []
    }

    private static func savePendingShares(_ items: [SharedItem]) {
        guard let data = try? JSONEncoder().encode(items) else { return }
        sharedDefaults?.set(data, forKey: pendingSharesKey)
    }
}
