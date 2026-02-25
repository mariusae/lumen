import Social
import UIKit
import UniformTypeIdentifiers

/// Share extension that accepts text and URLs from other apps and queues them
/// for the main Lumen app to process as new notes.
class ShareViewController: SLComposeServiceViewController {

    override func isContentValid() -> Bool {
        // Accept any content — we'll process it in didSelectPost
        true
    }

    override func didSelectPost() {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else {
            extensionContext?.completeRequest(returningItems: nil)
            return
        }

        let group = DispatchGroup()

        for item in items {
            guard let attachments = item.attachments else { continue }

            for provider in attachments {
                if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    group.enter()
                    provider.loadItem(forTypeIdentifier: UTType.url.identifier) { item, _ in
                        if let url = item as? URL {
                            self.saveSharedItem(type: "url", value: url.absoluteString)
                        }
                        group.leave()
                    }
                } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                    group.enter()
                    provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) { item, _ in
                        if let text = item as? String {
                            self.saveSharedItem(type: "text", value: text)
                        }
                        group.leave()
                    }
                }
            }
        }

        // Also include any text the user typed in the compose field
        if let contentText, !contentText.isEmpty {
            saveSharedItem(type: "text", value: contentText)
        }

        group.notify(queue: .main) {
            self.extensionContext?.completeRequest(returningItems: nil)
        }
    }

    override func configurationItems() -> [Any]! {
        []
    }

    // MARK: - Private

    private func saveSharedItem(type: String, value: String) {
        guard let defaults = UserDefaults(suiteName: "group.com.lumen.app") else { return }

        let item: [String: Any] = [
            "type": type,
            "value": value,
            "timestamp": Date().timeIntervalSince1970,
        ]

        var items = defaults.array(forKey: "pendingShares") as? [[String: Any]] ?? []
        items.append(item)

        // Encode back using Codable-compatible format for SharedStorage
        let codableItems = items.compactMap { dict -> [String: Any]? in
            guard let type = dict["type"] as? String,
                  let value = dict["value"] as? String,
                  let ts = dict["timestamp"] as? TimeInterval
            else { return nil }
            return ["type": type, "value": value, "timestamp": ts]
        }

        if let data = try? JSONSerialization.data(withJSONObject: codableItems) {
            defaults.set(data, forKey: "pendingShares")
        }
    }
}
