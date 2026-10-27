import SwiftUI

@main
struct BlockpadApp: App {
    var body: some Scene {
        WindowGroup {
            WebContainer()
                .ignoresSafeArea()          // the web app handles the notch / home indicator itself (viewport-fit=cover + env(safe-area-inset-*))
        }
    }
}
