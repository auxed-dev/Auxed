import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

/// 🔥 / 🙌 from the lock screen without unlocking (iOS 17+ LiveActivityIntent).
struct ReactIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "React to the song"
    @Parameter(title: "Set") var performanceId: String
    @Parameter(title: "Reaction") var emoji: String
    @Parameter(title: "API") var apiBase: String

    init() {}
    init(performanceId: String, emoji: String, apiBase: String) {
        self.performanceId = performanceId
        self.emoji = emoji
        self.apiBase = apiBase
    }

    func perform() async throws -> some IntentResult {
        guard let url = URL(string: "\(apiBase)/api/performances/\(performanceId)/react-now") else { return .result() }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("1", forHTTPHeaderField: "x-auxed-client")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["text": emoji])
        // The shared cookie store carries the AUXED session from the app.
        _ = try? await URLSession.shared.data(for: req)
        return .result()
    }
}

struct AuxedLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: AuxedActivityAttributes.self) { context in
            LockScreenCard(context: context)
                .activityBackgroundTint(Color.black.opacity(0.85))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) { Text("♪").font(.title2) }
                DynamicIslandExpandedRegion(.center) {
                    VStack(alignment: .leading) {
                        Text(context.state.title).font(.headline).lineLimit(1)
                        Text(context.state.artist).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) { Buttons(context: context) }
            } compactLeading: {
                Text("♪")
            } compactTrailing: {
                Text(timerInterval: Date()...Date(timeIntervalSince1970: context.state.endsAt), countsDown: true).monospacedDigit().frame(width: 40)
            } minimal: {
                Text("♪")
            }
        }
    }
}

private struct LockScreenCard: View {
    let context: ActivityViewContext<AuxedActivityAttributes>
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("\(context.state.venue.uppercased()) · LIVE").font(.caption2.bold()).foregroundStyle(Color(red: 0.82, green: 1, blue: 0.2))
                Spacer()
                Text(timerInterval: Date()...Date(timeIntervalSince1970: context.state.endsAt), countsDown: true).font(.caption.monospacedDigit()).foregroundStyle(.secondary)
            }
            Text("♪ \(context.state.title)").font(.headline).foregroundStyle(.white).lineLimit(1)
            Text(context.state.artist).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
            Buttons(context: context)
        }
        .padding(16)
    }
}

private struct Buttons: View {
    let context: ActivityViewContext<AuxedActivityAttributes>
    var body: some View {
        HStack(spacing: 10) {
            ForEach(["🔥", "🙌", "❤️", "💯"], id: \.self) { e in
                Button(intent: ReactIntent(performanceId: context.attributes.performanceId, emoji: e, apiBase: context.attributes.apiBase)) {
                    Text(e).font(.title3)
                }
                .buttonStyle(.plain)
                .frame(width: 38, height: 38)
                .background(Circle().fill(Color.white.opacity(0.12)))
            }
            Spacer()
            // Opens the request sheet in the app (spending money needs the phone unlocked).
            Link(destination: URL(string: "auxed://sets/\(context.attributes.performanceId)?request=1")!) {
                Text("♪ Request").font(.caption.bold()).padding(.horizontal, 12).padding(.vertical, 8)
                    .background(Capsule().fill(Color(red: 0.82, green: 1, blue: 0.2))).foregroundStyle(.black)
            }
        }
    }
}

@main
struct AuxedLiveActivityBundle: WidgetBundle {
    var body: some Widget { AuxedLiveActivityWidget() }
}
