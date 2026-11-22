package catflix.catlyn.app

import android.app.UiModeManager
import android.content.res.Configuration
import android.os.Bundle
import android.os.CancellationSignal
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.content.ContextCompat
import androidx.credentials.CredentialManager
import androidx.credentials.CredentialManagerCallback
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetCredentialResponse
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import org.json.JSONObject

class MainActivity : TauriActivity() {
  private var webView: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
    // Android TV's WebView rarely says "TV" in its user agent, so the interface (`device.ts`)
    // could not tell it is on a television. The app knows: it says so in the user agent.
    val uiMode = getSystemService(UI_MODE_SERVICE) as? UiModeManager
    if (uiMode?.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION) {
      val agent = webView.settings.userAgentString ?: ""
      if (!agent.contains("Android TV")) webView.settings.userAgentString = "$agent Android TV"
    }
    webView.addJavascriptInterface(GoogleBridge(), "CatflixGoogle")
  }

  /**
   * Google sign-in with Android's own account picker (`account.ts` calls `CatflixGoogle.signIn`).
   * The answer comes back through `window.__catflixGoogle({ token, error })`: an ID token made
   * out to Catflix's web client, which Catflix's server checks.
   */
  private inner class GoogleBridge {
    @JavascriptInterface
    fun signIn(clientId: String) {
      runOnUiThread { startGoogleSignIn(clientId) }
    }
  }

  private fun startGoogleSignIn(clientId: String) {
    val option = GetSignInWithGoogleOption.Builder(clientId).build()
    val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
    CredentialManager.create(this).getCredentialAsync(
      this,
      request,
      CancellationSignal(),
      ContextCompat.getMainExecutor(this),
      object : CredentialManagerCallback<GetCredentialResponse, GetCredentialException> {
        override fun onResult(result: GetCredentialResponse) {
          val credential = result.credential
          if (credential is CustomCredential &&
            credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
          ) {
            reply(GoogleIdTokenCredential.createFrom(credential.data).idToken, null)
          } else {
            reply(null, "unsupported")
          }
        }

        override fun onError(e: GetCredentialException) {
          reply(null, if (e is GetCredentialCancellationException) "cancelled" else (e.message ?: e.type))
        }
      },
    )
  }

  private fun reply(token: String?, error: String?) {
    val answer = JSONObject()
    answer.put("token", token ?: JSONObject.NULL)
    answer.put("error", error ?: JSONObject.NULL)
    webView?.evaluateJavascript("window.__catflixGoogle && window.__catflixGoogle($answer)", null)
  }
}
