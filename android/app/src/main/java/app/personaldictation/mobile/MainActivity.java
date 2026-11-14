package app.personaldictation.mobile;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DocumentSavePlugin.class);
        registerPlugin(DictationDevicePlugin.class);
        super.onCreate(savedInstanceState);
        // WebView wake-lock support varies. This flag only holds while foregrounded.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
}
