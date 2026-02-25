# Lumen iOS App

Native iOS wrapper for Lumen using WKWebView. Provides background sync, state restoration, push notifications, a share extension, and haptic feedback — capabilities that aren't possible in a PWA.

## Requirements

- Xcode 15+
- iOS 16.0+
- Node.js (for building the web app)

## Build

```bash
# Full build: web app → copy assets → generate Xcode project
app/scripts/build.sh

# Full build, then open Xcode
app/scripts/build.sh --open

# Skip the web build (if you already ran npm run build)
app/scripts/build.sh --skip-web
```

The build script handles everything: building the web app, copying assets into the bundle, cloning [XcodeGen](https://github.com/yonaskolb/XcodeGen) (one-time, into `app/.xcodegen/`), and generating the Xcode project via `swift run xcodegen`.

You can also run the steps individually:

```bash
npm run build                      # build web app
app/scripts/copy-web-assets.sh     # copy dist/ into bundle
cd app && swift run --package-path .xcodegen xcodegen generate
```

## Development

For hot reload during development, set the `LUMEN_DEV_URL` environment variable in your Xcode scheme:

1. Product → Scheme → Edit Scheme → Run → Arguments → Environment Variables
2. Add `LUMEN_DEV_URL` = `http://localhost:5173`
3. Start the Vite dev server from the project root: `npm run dev:vercel`
4. Run the app in Xcode

The app will load from the dev server instead of the bundled assets. Safari Web Inspector works for debugging (Develop → Simulator/Device → Lumen).

Debug builds enable `isInspectable` on the web view automatically.

## Architecture

The app is a thin native shell around WKWebView. All application logic stays in the web app — the native layer only provides capabilities the browser can't.

### JS ↔ Swift Bridge

`bridge.js` is injected at document start and creates `window.LumenNative`. The web app checks for this object and uses native APIs when available.

**JS → Swift:** `window.webkit.messageHandlers.<name>.postMessage(payload)`
**Swift → JS:** `webView.evaluateJavaScript("window.LumenNative._resolveCallback(id, result)")`

### Targets

| Target | Description |
|---|---|
| **Lumen** | Main app with WKWebView, background sync, notifications |
| **LumenShareExtension** | Share extension that accepts text/URLs from other apps |

Both targets share data via the `group.com.lumen.app` app group.

### Key Files

| File | Purpose |
|---|---|
| `Lumen/WebView/LumenWebView.swift` | WKWebView setup, loads bundled or dev server |
| `Lumen/WebView/NativeBridge.swift` | Routes all JS↔Swift messages |
| `Lumen/Bridge/bridge.js` | Creates `window.LumenNative` API |
| `Lumen/Background/BackgroundSync.swift` | BGAppRefreshTask + background task on suspend |
| `Lumen/State/StateRestoration.swift` | NSUserActivity for URL restoration |
| `Lumen/Storage/SharedStorage.swift` | App group storage shared with extension |
| `Lumen/Notifications/NotificationManager.swift` | APNS + local notifications |
| `scripts/copy-web-assets.sh` | Copies `dist/` into bundle, strips sourcemaps and SW |

## Provisioning

Before building for a device or submitting to the App Store, configure:

1. **Bundle ID**: Update `com.lumen.app` in `project.yml` to your own
2. **App Group**: Update `group.com.lumen.app` in both `.entitlements` files and in `SharedStorage.swift`
3. **Team**: Set your development team in Xcode after generating the project
4. **Push Notifications**: Enable the capability in the Apple Developer portal
