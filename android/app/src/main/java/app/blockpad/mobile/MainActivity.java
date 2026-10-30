package app.blockpad.mobile;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // The Back key / gesture is answered by the app first: BP.handleBack() closes a dialog or the side drawer, or goes
    // to the previous page, and says whether it did. Only when it did nothing (the first page, nothing open) does
    // Android do what it does by default: leave the app.
    getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
      private void leave() {
        setEnabled(false);
        getOnBackPressedDispatcher().onBackPressed();
        setEnabled(true);
      }

      @Override
      public void handleOnBackPressed() {
        final WebView web = getBridge() != null ? getBridge().getWebView() : null;
        if (web == null) {
          leave();
          return;
        }
        web.evaluateJavascript(
          "(function(){try{return !!(window.BP&&BP.handleBack&&BP.handleBack());}catch(e){return false;}})()",
          value -> {
            if (!"true".equals(value)) leave();
          }
        );
      }
    });
  }
}
