import UIKit
import WebKit

/// Routes messages between the web app (via bridge.js) and native iOS APIs.
///
/// The web app calls `window.webkit.messageHandlers.<name>.postMessage(payload)`
/// and this class handles each message type, optionally calling back into JS
/// with results via `webView.evaluateJavaScript()`.
final class NativeBridge: NSObject, WKScriptMessageHandler {
    static let shared = NativeBridge()

    weak var webView: WKWebView?

    /// All message handler names. Each maps to a postMessage channel.
    enum MessageName: String, CaseIterable {
        case saveState
        case getState
        case haptic
        case registerNotifications
        case beginBackgroundSync
        case getSharedItems
        case clearSharedItems
        case setPersistentValue
        case getPersistentValue
        case log
    }

    private override init() {
        super.init()
    }

    // MARK: - WKScriptMessageHandler

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard let name = MessageName(rawValue: message.name) else { return }
        let body = message.body

        switch name {
        case .saveState:
            handleSaveState(body)

        case .getState:
            handleGetState(body)

        case .haptic:
            handleHaptic(body)

        case .registerNotifications:
            handleRegisterNotifications(body)

        case .beginBackgroundSync:
            handleBeginBackgroundSync()

        case .getSharedItems:
            handleGetSharedItems(body)

        case .clearSharedItems:
            SharedStorage.clearPendingShares()

        case .setPersistentValue:
            handleSetPersistentValue(body)

        case .getPersistentValue:
            handleGetPersistentValue(body)

        case .log:
            if let msg = body as? String {
                print("[Lumen/Web] \(msg)")
            }
        }
    }

    // MARK: - Message Handlers

    private func handleSaveState(_ body: Any) {
        guard let url = body as? String else { return }
        StateRestoration.shared.save(url: url)
    }

    private func handleGetState(_ body: Any) {
        guard let callbackId = body as? String else { return }
        let url = StateRestoration.shared.savedURL
        resolve(callbackId: callbackId, result: url as Any)
    }

    private func handleHaptic(_ body: Any) {
        guard let style = body as? String else { return }
        switch style {
        case "light":
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        case "medium":
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        case "heavy":
            UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
        case "selection":
            UISelectionFeedbackGenerator().selectionChanged()
        case "success":
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        case "warning":
            UINotificationFeedbackGenerator().notificationOccurred(.warning)
        case "error":
            UINotificationFeedbackGenerator().notificationOccurred(.error)
        default:
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        }
    }

    private func handleRegisterNotifications(_ body: Any) {
        guard let callbackId = body as? String else { return }

        Task {
            let token = await NotificationManager.shared.registerForPushNotifications()
            await MainActor.run {
                self.resolve(callbackId: callbackId, result: token as Any)
            }
        }
    }

    private func handleBeginBackgroundSync() {
        BackgroundSync.shared.beginBackgroundTask()
    }

    private func handleGetSharedItems(_ body: Any) {
        guard let callbackId = body as? String else { return }

        SharedStorage.processPendingShares { items in
            let json = items.map { $0.toJSON() }
            DispatchQueue.main.async {
                self.resolve(callbackId: callbackId, result: json)
            }
        }
    }

    private func handleSetPersistentValue(_ body: Any) {
        guard let dict = body as? [String: Any],
              let key = dict["key"] as? String,
              let value = dict["value"] as? String
        else { return }

        SharedStorage.setValue(value, forKey: key)
    }

    private func handleGetPersistentValue(_ body: Any) {
        guard let dict = body as? [String: Any],
              let key = dict["key"] as? String,
              let callbackId = dict["callbackId"] as? String
        else { return }

        let value = SharedStorage.getValue(forKey: key)
        resolve(callbackId: callbackId, result: value as Any)
    }

    // MARK: - Callback to JS

    /// Resolve a pending JS promise by calling back into the web view.
    private func resolve(callbackId: String, result: Any) {
        guard let webView else { return }

        do {
            let data = try JSONSerialization.data(withJSONObject: ["result": result])
            guard let json = String(data: data, encoding: .utf8) else { return }
            let js = "window.LumenNative?._resolveCallback('\(callbackId.escapedForJS)', \(json).result)"
            webView.evaluateJavaScript(js)
        } catch {
            // For simple string/nil values that aren't valid top-level JSON
            if let str = result as? String {
                let js = "window.LumenNative?._resolveCallback('\(callbackId.escapedForJS)', '\(str.escapedForJS)')"
                webView.evaluateJavaScript(js)
            } else {
                let js = "window.LumenNative?._resolveCallback('\(callbackId.escapedForJS)', null)"
                webView.evaluateJavaScript(js)
            }
        }
    }
}
