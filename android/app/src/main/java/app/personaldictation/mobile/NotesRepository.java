package app.personaldictation.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import androidx.work.*;
import org.eclipse.jgit.api.Git;
import org.eclipse.jgit.api.errors.TransportException;
import org.eclipse.jgit.lib.StoredConfig;
import org.eclipse.jgit.transport.*;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** All repository mutations, including background work, share this lock. */
final class NotesRepository {
    static final Object LOCK = new Object();
    private final Context context;
    private final SharedPreferences prefs;
    private final File directory;
    NotesRepository(Context context) {
        this.context = context.getApplicationContext();
        prefs = context.getSharedPreferences("notes-sync", Context.MODE_PRIVATE);
        directory = new File(context.getFilesDir(), "notes-repository");
    }
    private Git open() throws Exception {
        Git git = new File(directory, ".git").isDirectory() ? Git.open(directory)
            : Git.init().setDirectory(directory).setInitialBranch("main").call();
        StoredConfig config = git.getRepository().getConfig();
        config.setString("user", null, "name", "Dictation");
        config.setString("user", null, "email", "dictation@localhost");
        config.save();
        return git;
    }
    boolean pending() { return prefs.getBoolean("pending", false); }
    boolean configured() { return prefs.contains("repository") && prefs.contains("token"); }
    String load() throws Exception {
        synchronized (LOCK) {
            try (Git git = open()) {
                File note = new File(directory, "notes/" + deviceId() + ".json");
                // Recover a crash between replacing the snapshot and creating its commit.
                if (note.exists() && !git.status().call().isClean()) save(new String(Files.readAllBytes(note.toPath()), StandardCharsets.UTF_8));
                return note.exists() ? new String(Files.readAllBytes(note.toPath()), StandardCharsets.UTF_8) : null;
            }
        }
    }
    private String deviceId() {
        String id = prefs.getString("device", null);
        if (id == null) { id = java.util.UUID.randomUUID().toString(); prefs.edit().putString("device", id).commit(); }
        return id;
    }
    void save(String json) throws Exception {
        synchronized (LOCK) {
            try (Git git = open()) {
                File notes = new File(directory, "notes");
                if (!notes.isDirectory() && !notes.mkdirs()) throw new Exception("Cannot create notes directory.");
                File file = new File(notes, deviceId() + ".json");
                File temporary = new File(directory, ".note-write.tmp");
                try (java.io.FileOutputStream output = new java.io.FileOutputStream(temporary)) {
                    output.write(json.getBytes(StandardCharsets.UTF_8)); output.getFD().sync();
                }
                Files.move(temporary.toPath(), file.toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                git.add().addFilepattern("notes").call();
                if (!git.status().call().isClean()) {
                    // Persist intent before committing so a crash cannot hide an unsynced commit.
                    prefs.edit().putBoolean("pending", true).commit();
                    git.commit().setMessage("Save dictation notes").setAuthor("Dictation", "dictation@localhost").call();
                }
            }
        }
    }
    void configure(String repository, String token) throws Exception {
        if (!repository.matches("[A-Za-z0-9-]+/[A-Za-z0-9_.-]+") || repository.endsWith("/.git"))
            throw new Exception("Use owner/repository on github.com.");
        if (token == null || token.trim().isEmpty() || token.length() > 1024 || token.matches(".*\\s.*")) throw new Exception("A GitHub token is required.");
        synchronized (LOCK) {
            if (configured() && !repository.equals(prefs.getString("repository", "")))
                throw new Exception("This notes repository is already linked. Use a fresh app installation to change its destination.");
            try (Git git = open()) {
                StoredConfig config = git.getRepository().getConfig();
                config.setString("remote", "origin", "url", "https://github.com/" + repository + ".git");
                config.setString("remote", "origin", "fetch", "+refs/heads/main:refs/remotes/origin/main");
                config.save();
            }
            prefs.edit().putString("repository", repository).putString("token", encrypt(token.trim())).commit();
        }
    }
    void schedule() {
        if (!pending() || !configured()) return;
        OneTimeWorkRequest work = new OneTimeWorkRequest.Builder(NotesSyncWorker.class)
            .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, java.util.concurrent.TimeUnit.SECONDS).build();
        WorkManager.getInstance(context).enqueueUniqueWork("dictation-git-sync", ExistingWorkPolicy.KEEP, work);
    }
    void sync() throws Exception {
        synchronized (LOCK) {
            if (!configured()) throw new Exception("Configure a GitHub repository first.");
            if (!pending()) return;
            if (!DictationDevicePlugin.isOnline(context)) throw new java.io.IOException("Offline: sync queued.");
            UsernamePasswordCredentialsProvider auth = new UsernamePasswordCredentialsProvider("x-access-token", decrypt(prefs.getString("token", "")));
            try (Git git = open()) {
                // Unique device files avoid normal multi-device edit conflicts. Never force-push.
                git.fetch().setRemote("origin").setCredentialsProvider(auth).setTimeout(30).call();
                if (git.getRepository().resolve("refs/remotes/origin/main") != null) {
                    org.eclipse.jgit.api.MergeResult merge = git.merge()
                        .include(git.getRepository().resolve("refs/remotes/origin/main"))
                        .setMessage("Merge remote notes").call();
                    if (!merge.getMergeStatus().isSuccessful()) throw new Exception("Git merge conflict: local notes retained; resolve before syncing.");
                }
                for (PushResult result : git.push().setRemote("origin").setRefSpecs(new RefSpec("refs/heads/main:refs/heads/main"))
                    .setCredentialsProvider(auth).setTimeout(30).call()) {
                    for (RemoteRefUpdate update : result.getRemoteUpdates()) {
                        if (update.getStatus() != RemoteRefUpdate.Status.OK && update.getStatus() != RemoteRefUpdate.Status.UP_TO_DATE)
                            throw new Exception("GitHub rejected the push. Check repository access and retry.");
                    }
                }
                prefs.edit().putBoolean("pending", false).commit();
            } catch (TransportException e) {
                // Never forward transport errors: some include credential-bearing URLs.
                throw new java.io.IOException("GitHub unavailable or access denied. Check token/repository and retry.");
            }
        }
    }
    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias("dictation-github")) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder("dictation-github", KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey("dictation-github", null);
    }
    private String encrypt(String text) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
        return Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(cipher.doFinal(text.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
    }
    private String decrypt(String value) throws Exception {
        String[] parts = value.split(":");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
    }
}
