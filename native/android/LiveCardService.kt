package app.auxed

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.RemoteInput
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * AUXED lock-screen card on Android: an ongoing notification with the song that's playing,
 * 🔥 react, ♪ Request and a Reply box that posts a quick line to the set's chat.
 * Start/update it with an Intent carrying performanceId, title, artist, venue and apiBase.
 */
class LiveCardService : Service() {
    companion object {
        const val CHANNEL = "auxed_live"
        const val ID = 4242
        const val KEY_REPLY = "reply"
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val i = intent ?: return START_NOT_STICKY
        when (i.action) {
            "react" -> post(i, i.getStringExtra("text") ?: "🔥")
            "reply" -> RemoteInput.getResultsFromIntent(i)?.getCharSequence(KEY_REPLY)?.let { post(i, it.toString()) }
            "stop" -> { stopForeground(STOP_FOREGROUND_REMOVE); stopSelf(); return START_NOT_STICKY }
            else -> startForeground(ID, build(i))
        }
        return START_STICKY
    }

    private fun build(i: Intent): Notification {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Now playing", NotificationManager.IMPORTANCE_LOW))
        val perf = i.getStringExtra("performanceId") ?: ""
        fun action(name: String, extra: Intent.() -> Unit = {}) =
            PendingIntent.getService(this, name.hashCode(), Intent(i).setAction(name).apply(extra), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE)
        val open = PendingIntent.getActivity(this, 0, Intent(Intent.ACTION_VIEW, Uri.parse("auxed://sets/$perf?request=1")), PendingIntent.FLAG_IMMUTABLE)
        val reply = NotificationCompat.Action.Builder(0, "Reply", action("reply"))
            .addRemoteInput(RemoteInput.Builder(KEY_REPLY).setLabel("Say something to the room").build()).build()
        return NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("♪ ${i.getStringExtra("title")}")
            .setContentText("${i.getStringExtra("artist")} · live at ${i.getStringExtra("venue")}")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .addAction(0, "🔥", action("react") { putExtra("text", "🔥") })
            .addAction(0, "♪ Request", open)
            .addAction(reply)
            .build()
    }

    /** POST /api/performances/:id/react-now with the WebView's session cookie. */
    private fun post(i: Intent, text: String) = thread {
        val base = i.getStringExtra("apiBase") ?: return@thread
        val perf = i.getStringExtra("performanceId") ?: return@thread
        val conn = URL("$base/api/performances/$perf/react-now").openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.doOutput = true
        conn.setRequestProperty("Content-Type", "application/json")
        conn.setRequestProperty("x-auxed-client", "1")
        android.webkit.CookieManager.getInstance().getCookie(base)?.let { conn.setRequestProperty("Cookie", it) }
        conn.outputStream.use { it.write("{\"text\":${org.json.JSONObject.quote(text)}}".toByteArray()) }
        conn.responseCode
        conn.disconnect()
    }
}
