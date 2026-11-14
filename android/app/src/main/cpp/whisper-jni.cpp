#include <jni.h>
#include <whisper.h>
#include <algorithm>
#include <cstdint>
#include <cstring>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace {
std::mutex lock;
whisper_context *context = nullptr;
void fail(JNIEnv *env, const char *message) { env->ThrowNew(env->FindClass("java/lang/IllegalStateException"), message); }
std::string quote(const std::string &text) {
    std::string result = "\"";
    for (unsigned char c : text) {
        if (c == '"' || c == '\\') { result += '\\'; result += c; }
        else if (c < 32) {
            const char *hex = "0123456789abcdef";
            result += "\\u00"; result += hex[c >> 4]; result += hex[c & 15];
        } else result += c;
    }
    return result + "\"";
}
uint32_t le(const std::vector<uint8_t> &b, size_t p, int count) {
    uint32_t value = 0; for (int i = 0; i < count; ++i) value |= uint32_t(b[p+i]) << (i*8); return value;
}
}
extern "C" JNIEXPORT jstring JNICALL
Java_app_personaldictation_mobile_DictationDevicePlugin_whisperTranscribe(JNIEnv *env, jclass, jstring path, jbyteArray audio, jstring language) {
    std::lock_guard<std::mutex> guard(lock);
    const auto size = env->GetArrayLength(audio);
    if (size < 44 || size > 400000) { fail(env, "Invalid audio size."); return nullptr; }
    std::vector<uint8_t> wav(size);
    env->GetByteArrayRegion(audio, 0, size, reinterpret_cast<jbyte *>(wav.data()));
    if (memcmp(wav.data(), "RIFF", 4) || memcmp(wav.data()+8, "WAVEfmt ", 8) || memcmp(wav.data()+36, "data", 4)
        || le(wav, 20, 2) != 1 || le(wav, 22, 2) != 1 || le(wav, 24, 4) != 16000 || le(wav, 34, 2) != 16
        || le(wav, 40, 4) != uint32_t(size-44) || (size-44)%2) {
        fail(env, "Expected mono 16 kHz PCM WAV."); return nullptr;
    }
    if (!context) {
        const char *filename = env->GetStringUTFChars(path, nullptr);
        auto parameters = whisper_context_default_params(); parameters.use_gpu = false;
        context = whisper_init_from_file_with_params(filename, parameters);
        env->ReleaseStringUTFChars(path, filename);
        if (!context) { fail(env, "Cannot load offline Whisper model. Download it again."); return nullptr; }
    }
    const char *lang = env->GetStringUTFChars(language, nullptr);
    std::string requested(lang); env->ReleaseStringUTFChars(language, lang);
    if (requested != "auto" && whisper_lang_id(requested.c_str()) < 0) { fail(env, "Unsupported language."); return nullptr; }
    std::vector<float> pcm((size-44)/2);
    for (size_t i = 0; i < pcm.size(); ++i) pcm[i] = static_cast<int16_t>(le(wav, 44+i*2, 2)) / 32768.0f;
    auto params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    params.n_threads = std::max(1u, std::min(4u, std::thread::hardware_concurrency()));
    params.language = requested == "auto" ? nullptr : requested.c_str();
    params.translate = false; params.no_context = true;
    params.print_realtime = false; params.print_progress = false; params.print_timestamps = false; params.print_special = false;
    if (whisper_full(context, params, pcm.data(), static_cast<int>(pcm.size())) != 0) { fail(env, "Offline inference failed; audio remains queued."); return nullptr; }
    std::string text;
    for (int i = 0; i < whisper_full_n_segments(context); ++i) text += whisper_full_get_segment_text(context, i);
    const char *detected = whisper_lang_str(whisper_full_lang_id(context));
    std::string json = "{\"text\":" + quote(text) + ",\"language\":" + quote(detected ? detected : "") + "}";
    // Use the UTF-8 constructor, not JNI's modified UTF-8 (supplementary characters).
    jbyteArray bytes = env->NewByteArray(json.size());
    env->SetByteArrayRegion(bytes, 0, json.size(), reinterpret_cast<const jbyte *>(json.data()));
    jclass stringClass = env->FindClass("java/lang/String");
    return static_cast<jstring>(env->NewObject(stringClass, env->GetMethodID(stringClass, "<init>", "([BLjava/lang/String;)V"), bytes, env->NewStringUTF("UTF-8")));
}
JNIEXPORT void JNICALL JNI_OnUnload(JavaVM *, void *) { if (context) whisper_free(context); context = nullptr; }
