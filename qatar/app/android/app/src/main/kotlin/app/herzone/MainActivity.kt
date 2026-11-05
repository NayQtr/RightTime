package app.herzone

import android.os.Build
import android.os.Bundle
import io.flutter.embedding.android.FlutterFragmentActivity

// FlutterFragmentActivity: needed by local_auth for the Face ID / fingerprint prompt (NMX-52)
class MainActivity : FlutterFragmentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // The recent-apps preview is taken when the app pauses, often before Flutter draws its privacy cover, so the
        // venue or table code could show there (app review #2). Android 13+ can leave the preview blank instead.
        // Screenshots stay allowed: blocking them is a separate product decision.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) setRecentsScreenshotEnabled(false)
    }
}
