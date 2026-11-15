package app.personaldictation.mobile;

import android.content.Context;
import android.net.*;
import android.util.Base64;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import java.io.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "DictationDevice")
public class DictationDevicePlugin extends Plugin {
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final ExecutorService inference = Executors.newSingleThreadExecutor();
    private ConnectivityManager manager;
    private ConnectivityManager.NetworkCallback callback;
    private volatile boolean downloading;
    private static final String MODEL_HASH = "818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7";
    private static final long MODEL_SIZE = 32152673;
    private static final String MODEL_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-tiny-q5_1.bin";
    private static native String whisperTranscribe(String path, byte[] wav, String language, String libraryDir);
    static { System.loadLibrary("dictation-whisper"); }
    static boolean isOnline(Context context) {
        ConnectivityManager cm = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkCapabilities capabilities = cm.getNetworkCapabilities(cm.getActiveNetwork());
        return capabilities != null && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
    }
    @Override public void load() {
        manager = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        callback = new ConnectivityManager.NetworkCallback() {
            @Override public void onCapabilitiesChanged(Network network, NetworkCapabilities capabilities) { changed(); }
            @Override public void onLost(Network network) { changed(); }
            @Override public void onAvailable(Network network) { changed(); }
        };
        if (android.os.Build.VERSION.SDK_INT >= 24) manager.registerDefaultNetworkCallback(callback);
        else manager.registerNetworkCallback(new NetworkRequest.Builder().addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build(), callback);
    }
    private void changed() {
        JSObject status = new JSObject(); status.put("online", isOnline(getContext()));
        notifyListeners("networkChanged", status);
    }
    @Override protected void handleOnDestroy() {
        if (callback != null) manager.unregisterNetworkCallback(callback);
        io.shutdown(); inference.shutdown();
    }
    @PluginMethod public void networkStatus(PluginCall call) {
        JSObject result = new JSObject(); result.put("online", isOnline(getContext())); call.resolve(result);
    }
    @PluginMethod public void loadNotes(PluginCall call) {
        io.execute(() -> {
            try {
                String json = new java.io.File(getContext().getFilesDir(), "dictation-notes.json").exists()
                    ? new String(java.nio.file.Files.readAllBytes(new java.io.File(getContext().getFilesDir(), "dictation-notes.json").toPath()), java.nio.charset.StandardCharsets.UTF_8)
                    : null;
                JSObject result = new JSObject();
                if (json != null) result.put("document", new JSONObject(json));
                call.resolve(result);
            } catch (Exception e) { call.reject("Could not load saved notes."); }
        });
    }
    @PluginMethod public void saveNotes(PluginCall call) {
        JSObject document = call.getObject("document");
        if (document == null) { call.reject("Missing transcript."); return; }
        io.execute(() -> {
            try {
                java.io.File file = new java.io.File(getContext().getFilesDir(), "dictation-notes.json");
                java.nio.file.Files.write(file.toPath(), document.toString(2).getBytes(java.nio.charset.StandardCharsets.UTF_8));
                call.resolve();
            }
            catch (Exception e) { call.reject("Could not save notes locally."); }
        });
    }
    private File model() { return new File(getContext().getFilesDir(), "ggml-tiny-q5_1.bin"); }
    @PluginMethod public void modelStatus(PluginCall call) {
        io.execute(() -> {
            try {
                JSObject result = new JSObject();
                result.put("ready", ModelDownloader.isValid(model(), MODEL_SIZE, MODEL_HASH));
                call.resolve(result);
            } catch (IOException | java.security.NoSuchAlgorithmException e) {
                call.reject("Could not verify offline model.", e);
            }
        });
    }
    @PluginMethod public synchronized void downloadModel(PluginCall call) {
        if (downloading) { call.reject("Model download already in progress."); return; }
        downloading = true;
        io.execute(() -> {
            File temporary = new File(getContext().getFilesDir(), "whisper-download.part");
            try {
                if (!isOnline(getContext())) throw new IOException("Connect to the internet to download the offline model first.");
                ModelDownloader.download(MODEL_URL, temporary, model(), MODEL_SIZE, MODEL_HASH);
                call.resolve();
            } catch (Exception e) { temporary.delete(); call.reject(e.getMessage()); }
            finally { downloading = false; }
        });
    }
    @PluginMethod public void transcribe(PluginCall call) {
        String audio = call.getString("audio", ""); String language = call.getString("language", "auto");
        inference.execute(() -> {
            try {
                if (!model().isFile() || model().length() != MODEL_SIZE) throw new IOException("Download the offline Whisper model in Settings while online first. Captured audio stays queued.");
                if (audio.length() > 500000) throw new IOException("Audio chunk too large.");
                String text = whisperTranscribe(model().getAbsolutePath(), Base64.decode(audio, Base64.DEFAULT), language, getContext().getApplicationInfo().nativeLibraryDir);
                JSObject result = new JSObject(text); call.resolve(result);
            } catch (Exception e) { call.reject(e.getMessage()); }
        });
    }
}
