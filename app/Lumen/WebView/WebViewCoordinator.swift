import UIKit
import WebKit

/// Handles WKWebView navigation and UI delegate callbacks.
class WebViewCoordinator: NSObject, WKNavigationDelegate, WKUIDelegate {

    // MARK: - WKNavigationDelegate

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }

        // Open external links (e.g., GitHub OAuth) in Safari
        if navigationAction.navigationType == .linkActivated,
           url.scheme == "https" || url.scheme == "http",
           !isInternalURL(url) {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }

        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // Save the current URL for state restoration
        if let url = webView.url {
            let path = url.path + (url.query.map { "?\($0)" } ?? "")
            StateRestoration.shared.save(url: path)
        }

        // Check for pending shared items from the share extension
        SharedStorage.processPendingShares { items in
            guard !items.isEmpty else { return }
            let json = items.map { $0.toJSON() }
            if let data = try? JSONSerialization.data(withJSONObject: json),
               let jsonString = String(data: data, encoding: .utf8) {
                let js = "window.LumenNative?._onSharedItems(\(jsonString))"
                webView.evaluateJavaScript(js)
            }
        }
    }

    // MARK: - WKUIDelegate

    /// Handle JavaScript `alert()`.
    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping () -> Void
    ) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        topViewController?.present(alert, animated: true)
    }

    /// Handle JavaScript `confirm()`.
    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (Bool) -> Void
    ) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        topViewController?.present(alert, animated: true)
    }

    /// Handle JavaScript `prompt()`.
    func webView(
        _ webView: WKWebView,
        runJavaScriptTextInputPanelWithPrompt prompt: String,
        defaultText: String?,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (String?) -> Void
    ) {
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in
            completionHandler(alert.textFields?.first?.text)
        })
        topViewController?.present(alert, animated: true)
    }

    /// Handle `window.open()` for OAuth popups etc.
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url {
            UIApplication.shared.open(url)
        }
        return nil
    }

    /// Handle microphone permission requests (voice assistant).
    func webView(
        _ webView: WKWebView,
        requestMediaCapturePermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        type: WKMediaCaptureType,
        decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
        decisionHandler(.grant)
    }

    // MARK: - Helpers

    private func isInternalURL(_ url: URL) -> Bool {
        // File URLs are always internal (bundled web app)
        if url.isFileURL { return true }

        #if DEBUG
        // In dev mode, localhost is internal
        if url.host == "localhost" || url.host == "127.0.0.1" { return true }
        #endif

        return false
    }

    private var topViewController: UIViewController? {
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let window = scene.windows.first
        else { return nil }

        var vc = window.rootViewController
        while let presented = vc?.presentedViewController {
            vc = presented
        }
        return vc
    }
}
