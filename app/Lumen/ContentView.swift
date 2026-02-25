import SwiftUI

struct ContentView: View {
    @StateObject private var stateRestoration = StateRestoration.shared

    var body: some View {
        LumenWebView()
            .ignoresSafeArea(.container, edges: .bottom)
            .onContinueUserActivity(StateRestoration.activityType) { activity in
                stateRestoration.restore(from: activity)
            }
    }
}
