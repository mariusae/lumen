import SwiftUI
import WebKit

struct LumenWebView: UIViewRepresentable {
    func makeCoordinator() -> WebViewCoordinator {
        WebViewCoordinator()
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        // Allow access to the device microphone (voice assistant)
        config.allowsAirPlayForMediaPlayback = true

        // Set up the native bridge message handlers
        let bridge = NativeBridge.shared
        let contentController = config.userContentController

        for handler in NativeBridge.MessageName.allCases {
            contentController.add(bridge, name: handler.rawValue)
        }

        // Inject the bridge script before any page content loads
        if let bridgeScript = Self.loadBridgeScript() {
            let userScript = WKUserScript(
                source: bridgeScript,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
            contentController.addUserScript(userScript)
        }

        // Data detection for links, phone numbers, etc.
        config.dataDetectorTypes = [.link]

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.contentInsetAdjustmentBehavior = .never

        // Allow back/forward swipe gestures
        webView.allowsBackForwardNavigationGestures = true

        // Allow inspection in debug builds
        #if DEBUG
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }
        #endif

        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator

        // Store a weak reference so the bridge can call back into the web view
        NativeBridge.shared.webView = webView

        // Load the web app
        loadApp(in: webView)

        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        // Check if there's a pending URL from state restoration or notification tap
        if let pendingURL = StateRestoration.shared.consumePendingURL() {
            let js = "window.LumenNative?._navigateTo('\(pendingURL.escapedForJS)')"
            webView.evaluateJavaScript(js)
        }
    }

    // MARK: - Private

    private func loadApp(in webView: WKWebView) {
        #if DEBUG
        // In debug, load from the Vite dev server for hot reload
        if let devURL = ProcessInfo.processInfo.environment["LUMEN_DEV_URL"],
           let url = URL(string: devURL) {
            webView.load(URLRequest(url: url))
            return
        }
        #endif

        // Production: load the bundled web app
        guard let webDir = Bundle.main.resourceURL?.appendingPathComponent("web"),
              let indexURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "web")
        else {
            print("[Lumen] Error: web assets not found in bundle")
            return
        }

        webView.loadFileURL(indexURL, allowingReadAccessTo: webDir)
    }

    private static func loadBridgeScript() -> String? {
        guard let url = Bundle.main.url(forResource: "bridge", withExtension: "js") else {
            print("[Lumen] Error: bridge.js not found in bundle")
            return nil
        }
        return try? String(contentsOf: url, encoding: .utf8)
    }
}

// MARK: - Helpers

extension String {
    /// Escape a string for safe embedding in a JavaScript string literal.
    var escapedForJS: String {
        self
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
            .replacingOccurrences(of: "\n", with: "\\n")
            .replacingOccurrences(of: "\r", with: "\\r")
    }
}
