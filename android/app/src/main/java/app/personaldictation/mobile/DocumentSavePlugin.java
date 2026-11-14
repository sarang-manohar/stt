package app.personaldictation.mobile;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** Saves through the Storage Access Framework; no broad storage permission needed. */
@CapacitorPlugin(name = "DocumentSave")
public class DocumentSavePlugin extends Plugin {
    private volatile boolean saving = false;

    @PluginMethod
    public void save(PluginCall call) {
        if (saving) {
            call.reject("A save is already in progress.");
            return;
        }
        if (call.getString("data") == null) {
            call.reject("Missing document text.");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(call.getString("mimeType", "text/plain"));
        intent.putExtra(Intent.EXTRA_TITLE, call.getString("filename", "transcript.txt"));
        saving = true;
        try {
            startActivityForResult(call, intent, "documentCreated");
        } catch (Exception error) {
            saving = false;
            call.reject("Could not open the document picker.", error);
        }
    }

    @ActivityCallback
    private void documentCreated(PluginCall call, ActivityResult result) {
        if (call == null) {
            saving = false;
            return;
        }
        if (result.getResultCode() != Activity.RESULT_OK) {
            saving = false;
            JSObject response = new JSObject();
            response.put("cancelled", true);
            call.resolve(response);
            return;
        }
        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (uri == null) {
            saving = false;
            call.reject("No document destination returned.");
            return;
        }
        // A cloud document provider may block; never write on the UI thread.
        getBridge().execute(() -> {
            try (OutputStream output = getContext().getContentResolver().openOutputStream(uri, "wt")) {
                if (output == null) throw new java.io.IOException("Could not open destination.");
                output.write(call.getString("data", "").getBytes(StandardCharsets.UTF_8));
                output.flush();
            } catch (Exception error) {
                saving = false;
                call.reject("Could not save transcript.", error);
                return;
            }
            saving = false;
            JSObject response = new JSObject();
            response.put("cancelled", false);
            call.resolve(response);
        });
    }
}
