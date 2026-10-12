import ActivityKit
import Foundation

/// Shared by the App and the widget extension. The server's APNs updates send `content-state`
/// with exactly these keys (see lib/server/push.ts → notifyNowPlaying).
struct AuxedActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var title: String
        var artist: String
        var venue: String
        /// Unix time the current song ends (drives the countdown).
        var endsAt: Double
    }

    var performanceId: String
    var apiBase: String
}
