package app.personaldictation.mobile;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

public class NotesSyncWorker extends Worker {
    public NotesSyncWorker(@NonNull Context context, @NonNull WorkerParameters parameters) { super(context, parameters); }
    @NonNull @Override public Result doWork() {
        try {
            new NotesRepository(getApplicationContext()).sync();
            return Result.success();
        } catch (Exception ignored) { return Result.retry(); }
    }
}
