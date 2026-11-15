package app.personaldictation.mobile;

import static org.junit.Assert.*;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class ModelDownloaderTest {
    @Rule public TemporaryFolder folder = new TemporaryFolder();
    private static final String HASH = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

    private static class Response extends HttpURLConnection {
        private final int status;
        private final String location;
        private final byte[] body;
        Response(URL url, int status, String location, String body) {
            super(url);
            this.status = status;
            this.location = location;
            this.body = body.getBytes(StandardCharsets.UTF_8);
        }
        @Override public int getResponseCode() { return status; }
        @Override public String getHeaderField(String name) { return "Location".equals(name) ? location : null; }
        @Override public InputStream getInputStream() { return new ByteArrayInputStream(body); }
        @Override public void disconnect() {}
        @Override public boolean usingProxy() { return false; }
        @Override public void connect() {}
    }

    @Test public void verifiesInstalledModelContentsNotJustSize() throws Exception {
        File model = folder.newFile("model");
        Files.write(model.toPath(), "abc".getBytes(StandardCharsets.UTF_8));
        assertTrue(ModelDownloader.isValid(model, 3, HASH));
        Files.write(model.toPath(), "bad".getBytes(StandardCharsets.UTF_8));
        assertFalse(ModelDownloader.isValid(model, 3, HASH));
        assertFalse(ModelDownloader.isValid(new File(folder.getRoot(), "missing"), 3, HASH));
    }

    @Test public void followsHttpsRedirectAndInstallsVerifiedBytes() throws Exception {
        File temporary = new File(folder.getRoot(), "download.part");
        File destination = new File(folder.getRoot(), "model.bin");
        ModelDownloader.download("https://example.test/model", temporary, destination, 3, HASH, url ->
            url.getHost().equals("example.test")
                ? new Response(url, 302, "https://cdn.test/model", "")
                : new Response(url, 200, null, "abc"));
        assertEquals("abc", new String(Files.readAllBytes(destination.toPath()), StandardCharsets.UTF_8));
        assertFalse(temporary.exists());
    }

    @Test public void rejectsInsecureRedirect() throws Exception {
        try {
            ModelDownloader.download("https://example.test/model", new File(folder.getRoot(), "part"),
                new File(folder.getRoot(), "model"), 3, HASH,
                url -> new Response(url, 302, "http://cdn.test/model", ""));
            fail("Expected HTTPS error");
        } catch (IOException error) {
            assertTrue(error.getMessage().contains("HTTPS"));
        }
    }

    @Test public void rejectsBadBytesWithoutReplacingExistingModel() throws Exception {
        File destination = folder.newFile("model");
        Files.write(destination.toPath(), "old".getBytes(StandardCharsets.UTF_8));
        try {
            ModelDownloader.download("https://example.test/model", new File(folder.getRoot(), "part"),
                destination, 3, HASH, url -> new Response(url, 200, null, "bad"));
            fail("Expected verification error");
        } catch (IOException error) {
            assertTrue(error.getMessage().contains("verification"));
        }
        assertEquals("old", new String(Files.readAllBytes(destination.toPath()), StandardCharsets.UTF_8));
    }

    @Test public void reportsHttpStatus() throws Exception {
        try {
            ModelDownloader.download("https://example.test/model", new File(folder.getRoot(), "part"),
                new File(folder.getRoot(), "model"), 3, HASH,
                url -> new Response(url, 404, null, ""));
            fail("Expected HTTP error");
        } catch (IOException error) {
            assertTrue(error.getMessage().contains("HTTP 404"));
        }
    }
}
