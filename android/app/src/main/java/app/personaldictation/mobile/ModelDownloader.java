package app.personaldictation.mobile;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

final class ModelDownloader {
    interface ConnectionFactory { HttpURLConnection open(URL url) throws IOException; }
    interface ProgressListener { void onProgress(long bytesReceived, long totalBytes); }

    static final class Cancellation {
        private boolean cancelled;
        private boolean installed;
        private HttpURLConnection connection;

        synchronized void throwIfCancelled() throws IOException {
            if (cancelled) throw new IOException("Model download cancelled.");
        }

        synchronized boolean isCancelled() {
            return cancelled;
        }

        boolean cancel() {
            HttpURLConnection active;
            synchronized (this) {
                if (installed) return false;
                cancelled = true;
                active = connection;
            }
            if (active != null) active.disconnect();
            return true;
        }

        synchronized void setConnection(HttpURLConnection active) {
            connection = active;
            if (cancelled) active.disconnect();
        }

        synchronized void clearConnection(HttpURLConnection active) {
            if (connection == active) connection = null;
        }

        synchronized void install(File temporary, File destination) throws IOException {
            throwIfCancelled();
            if (!temporary.renameTo(destination)) throw new IOException("Cannot install model.");
            installed = true;
        }
    }

    static boolean isValid(File model, long expectedSize, String expectedHash)
            throws IOException, NoSuchAlgorithmException {
        if (!model.isFile() || model.length() != expectedSize) return false;
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new FileInputStream(model)) {
            byte[] buffer = new byte[65536];
            int count;
            while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
        }
        return expectedHash.equals(hex(digest.digest()));
    }

    static void requireValid(File model, long expectedSize, String expectedHash)
            throws IOException, NoSuchAlgorithmException {
        if (!isValid(model, expectedSize, expectedHash)) {
            throw new IOException("Offline Whisper model failed integrity verification. Download it again in Settings.");
        }
    }

    private static String hex(byte[] bytes) {
        StringBuilder hash = new StringBuilder();
        for (byte b : bytes) hash.append(String.format("%02x", b & 255));
        return hash.toString();
    }

    static void download(String url, File temporary, File destination, long expectedSize, String expectedHash)
            throws IOException, NoSuchAlgorithmException {
        download(url, temporary, destination, expectedSize, expectedHash,
            address -> (HttpURLConnection) address.openConnection());
    }

    static void download(String address, File temporary, File destination, long expectedSize, String expectedHash,
            ConnectionFactory factory) throws IOException, NoSuchAlgorithmException {
        download(address, temporary, destination, expectedSize, expectedHash, factory, new Cancellation(),
            (bytesReceived, totalBytes) -> {});
    }

    static void download(String address, File temporary, File destination, long expectedSize, String expectedHash,
            ConnectionFactory factory, Cancellation cancellation, ProgressListener progress)
            throws IOException, NoSuchAlgorithmException {
        URL url = new URL(address);
        boolean installed = false;
        try {
            for (int redirects = 0; redirects <= 5; redirects++) {
                cancellation.throwIfCancelled();
                if (!"https".equalsIgnoreCase(url.getProtocol())) throw new IOException("Model download requires HTTPS.");
                HttpURLConnection connection = factory.open(url);
                cancellation.setConnection(connection);
                try {
                    connection.setInstanceFollowRedirects(false);
                    connection.setConnectTimeout(30000);
                    connection.setReadTimeout(30000);
                    connection.setRequestProperty("Cache-Control", "no-cache");
                    int status = connection.getResponseCode();
                    cancellation.throwIfCancelled();
                    if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                        String location = connection.getHeaderField("Location");
                        if (location == null || redirects == 5) throw new IOException("Invalid model server redirect.");
                        url = new URL(url, location);
                        continue;
                    }
                    if (status != 200) throw new IOException("Model download failed (HTTP " + status + "); retry while online.");
                    MessageDigest digest = MessageDigest.getInstance("SHA-256");
                    long size = 0;
                    try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(temporary)) {
                        byte[] buffer = new byte[65536];
                        int count;
                        while (true) {
                            cancellation.throwIfCancelled();
                            count = input.read(buffer);
                            if (count == -1) break;
                            cancellation.throwIfCancelled();
                            size += count;
                            if (size > expectedSize) throw new IOException("Invalid model size.");
                            digest.update(buffer, 0, count);
                            output.write(buffer, 0, count);
                            progress.onProgress(size, expectedSize);
                        }
                        output.getFD().sync();
                    }
                    cancellation.throwIfCancelled();
                    if (size != expectedSize || !expectedHash.equals(hex(digest.digest()))) {
                        throw new IOException("Model verification failed; retry download.");
                    }
                    cancellation.install(temporary, destination);
                    installed = true;
                    return;
                } catch (IOException error) {
                    if (cancellation.isCancelled()) throw new IOException("Model download cancelled.", error);
                    throw error;
                } finally {
                    cancellation.clearConnection(connection);
                    connection.disconnect();
                }
            }
        } catch (IOException | NoSuchAlgorithmException error) {
            if (!installed) {
                try {
                    java.nio.file.Files.deleteIfExists(temporary.toPath());
                } catch (IOException cleanupError) {
                    error.addSuppressed(cleanupError);
                }
            }
            throw error;
        }
        throw new IOException("Too many model server redirects.");
    }
}
