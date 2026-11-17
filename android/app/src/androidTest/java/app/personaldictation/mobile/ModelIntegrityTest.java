package app.personaldictation.mobile;

import static org.junit.Assert.*;

import android.content.Context;
import android.content.ContextWrapper;
import android.os.Bundle;
import android.util.Base64;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.io.File;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class ModelIntegrityTest {
    private static class CapturedCall extends PluginCall {
        private final CountDownLatch completed = new CountDownLatch(1);
        private JSObject result;
        private String error;

        CapturedCall(String method, JSObject data) {
            super(null, "DictationDevice", "integrity-test", method, data);
        }

        @Override public void resolve(JSObject data) {
            result = data;
            completed.countDown();
        }

        @Override public void reject(String message, String code, Exception exception, JSObject data) {
            error = message;
            completed.countDown();
        }

        void await() throws InterruptedException {
            assertTrue("Plugin call timed out", completed.await(120, TimeUnit.SECONDS));
        }
    }

    @Test public void verifiesModelBeforeEveryInferenceAndRecoversAfterReplacement() throws Exception {
        String fixtureAsset = InstrumentationRegistry.getArguments().getString("modelAsset");
        assertNotNull("Pass -e modelAsset with the verified model asset name in the test APK", fixtureAsset);
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File directory = Files.createTempDirectory(target.getCacheDir().toPath(), "model-integrity-").toFile();
        File model = new File(directory, "ggml-tiny-q5_1.bin");
        Context context = new ContextWrapper(target) {
            @Override public File getFilesDir() { return directory; }
        };
        DictationDevicePlugin plugin = new DictationDevicePlugin() {
            @Override public Context getContext() { return context; }
        };
        try {
            installFixture(fixtureAsset, model);
            assertReady(plugin, true);
            String initialBackend = assertInferenceSucceeds(plugin);

            long originalSize = model.length();
            try (RandomAccessFile file = new RandomAccessFile(model, "rw")) {
                int firstByte = file.readUnsignedByte();
                file.seek(0);
                file.write(firstByte ^ 1);
            }
            assertEquals(originalSize, model.length());
            assertReady(plugin, false);
            CapturedCall rejected = transcribe(plugin);
            assertNull("Altered model must not return a transcript", rejected.result);
            assertNotNull("Altered model must be rejected before cached JNI inference", rejected.error);
            assertTrue(rejected.error.contains("integrity verification"));
            assertTrue(rejected.error.contains("Settings"));

            installFixture(fixtureAsset, model);
            assertReady(plugin, true);
            String recoveredBackend = assertInferenceSucceeds(plugin);
            Bundle evidence = new Bundle();
            evidence.putString("initialBackend", initialBackend);
            evidence.putString("alteredModel", "not ready; rejected before cached JNI inference");
            evidence.putString("recoveredBackend", recoveredBackend);
            InstrumentationRegistry.getInstrumentation().sendStatus(2, evidence);
        } finally {
            plugin.handleOnDestroy();
            Files.deleteIfExists(model.toPath());
            Files.delete(directory.toPath());
        }
    }

    private static void installFixture(String asset, File model) throws Exception {
        Context test = InstrumentationRegistry.getInstrumentation().getContext();
        try (InputStream input = test.getAssets().open(asset)) {
            Files.copy(input, model.toPath(), StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private static void assertReady(DictationDevicePlugin plugin, boolean expected) throws Exception {
        CapturedCall call = new CapturedCall("modelStatus", new JSObject());
        plugin.modelStatus(call);
        call.await();
        assertNull(call.error, call.error);
        assertNotNull(call.result);
        assertEquals(expected, call.result.getBoolean("ready"));
    }

    private static String assertInferenceSucceeds(DictationDevicePlugin plugin) throws Exception {
        CapturedCall call = transcribe(plugin);
        assertNull(call.error, call.error);
        assertNotNull(call.result);
        assertTrue(call.result.has("text"));
        assertEquals("en", call.result.getString("language"));
        String backend = call.result.getString("backend");
        assertTrue("Unexpected inference backend: " + backend, backend.equals("cpu") || backend.equals("vulkan"));
        return backend;
    }

    private static CapturedCall transcribe(DictationDevicePlugin plugin) throws Exception {
        // One second of synthetic silence exercises real JNI without microphone or personal audio.
        ByteBuffer wav = ByteBuffer.allocate(32044).order(ByteOrder.LITTLE_ENDIAN);
        wav.put("RIFF".getBytes(StandardCharsets.US_ASCII)).putInt(32036);
        wav.put("WAVEfmt ".getBytes(StandardCharsets.US_ASCII)).putInt(16);
        wav.putShort((short) 1).putShort((short) 1).putInt(16000).putInt(32000);
        wav.putShort((short) 2).putShort((short) 16);
        wav.put("data".getBytes(StandardCharsets.US_ASCII)).putInt(32000);
        JSObject data = new JSObject();
        data.put("audio", Base64.encodeToString(wav.array(), Base64.NO_WRAP));
        data.put("language", "en");
        CapturedCall call = new CapturedCall("transcribe", data);
        plugin.transcribe(call);
        call.await();
        return call;
    }
}
