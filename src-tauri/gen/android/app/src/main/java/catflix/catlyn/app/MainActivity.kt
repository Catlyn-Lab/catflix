package catflix.catlyn.app

import android.app.UiModeManager
import android.content.res.Configuration
import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  /**
   * Android TV's WebView rarely says "TV" in its user agent, so the interface (`device.ts`) could
   * not tell it is on a television. The app knows: it says so in the user agent.
   */
  override fun onWebViewCreate(webView: WebView) {
    val uiMode = getSystemService(UI_MODE_SERVICE) as? UiModeManager
    if (uiMode?.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION) {
      val agent = webView.settings.userAgentString ?: ""
      if (!agent.contains("Android TV")) webView.settings.userAgentString = "$agent Android TV"
    }
  }
}
