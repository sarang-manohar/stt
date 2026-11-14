package app.personaldictation.mobile;

import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.eclipse.jgit.api.Git;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class NotesRepositoryTest {
    @Test public void initializesCommitsAndRestoresWithoutPuttingCredentialsInGit() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        NotesRepository repository = new NotesRepository(context);
        String json = "{\"00:00\":\"नमस्ते offline\"}";
        repository.save(json);
        assertEquals(json, new NotesRepository(context).load());
        assertTrue(new NotesRepository(context).pending());
        repository.configure("example/dictation-notes", "github_pat_instrumentation_only");
        File directory = new File(context.getFilesDir(), "notes-repository");
        try (Git git = Git.open(directory)) {
            assertNotNull(git.getRepository().resolve("HEAD"));
            assertTrue(git.status().call().isClean());
            assertEquals("https://github.com/example/dictation-notes.git", git.getRepository().getConfig().getString("remote", "origin", "url"));
        }
        String config = new String(Files.readAllBytes(new File(directory, ".git/config").toPath()), StandardCharsets.UTF_8);
        assertFalse(config.contains("github_pat_instrumentation_only"));
        assertFalse(context.getSharedPreferences("notes-sync", Context.MODE_PRIVATE).getString("token", "").contains("github_pat_instrumentation_only"));
        repository.save("{}");
        assertEquals("{}", repository.load()); // Clear is durable, not a Git history deletion.
    }
}
