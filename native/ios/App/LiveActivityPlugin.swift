import ActivityKit
import Capacitor
import Foundation

/// Capacitor plugin: start / end the AUXED lock-screen card and hand its push token to the server.
/// JS side: lib/client/native.ts.
@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivityPlugin"
    public let jsName = "LiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
    ]

    @objc func start(_ call: CAPPluginCall) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return call.reject("Live Activities are turned off for AUXED.") }
        let attrs = AuxedActivityAttributes(performanceId: call.getString("performanceId") ?? "", apiBase: call.getString("apiBase") ?? "")
        let state = AuxedActivityAttributes.ContentState(
            title: call.getString("title") ?? "",
            artist: call.getString("artist") ?? "",
            venue: call.getString("venue") ?? "",
            endsAt: call.getDouble("endsAt") ?? Date().addingTimeInterval(180).timeIntervalSince1970
        )
        do {
            for a in Activity<AuxedActivityAttributes>.activities { Task { await a.end(nil, dismissalPolicy: .immediate) } }
            let activity = try Activity.request(attributes: attrs, content: .init(state: state, staleDate: nil), pushType: .token)
            Task {
                for await data in activity.pushTokenUpdates {
                    let token = data.map { String(format: "%02x", $0) }.joined()
                    self.notifyListeners("token", data: ["token": token, "performanceId": attrs.performanceId])
                }
            }
            call.resolve(["id": activity.id])
        } catch {
            call.reject(error.localizedDescription)
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        for a in Activity<AuxedActivityAttributes>.activities { Task { await a.end(nil, dismissalPolicy: .immediate) } }
        call.resolve()
    }
}
