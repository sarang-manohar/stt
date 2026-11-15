#include <jni.h>
#include <whisper.h>
#include <ggml-backend.h>
#include <algorithm>
#include <cstdint>
#include <cstring>
#include <mutex>
#include <string>
#include <thread>
#include <vector>
#include <android/log.h>

namespace {
std::mutex lock;
whisper_context *context = nullptr;
bool gpu_active = false;
bool backends_loaded = false;
void whisper_log(enum ggml_log_level level, const char *text, void *) {
    if (strstr(text, "whisper_backend_init_gpu: using ")) gpu_active = true;
    if (strstr(text, "whisper_backend_init_gpu: failed to initialize ")) gpu_active = false;
    __android_log_print(level == GGML_LOG_LEVEL_ERROR ? ANDROID_LOG_ERROR : ANDROID_LOG_INFO, "dictation-whisper", "%s", text);
}
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
// Common Hindi / Hinglish vocabulary prompt to steer Whisper toward Devanagari output.
const char *HINDI_INITIAL_PROMPT = "नमस्ते, कैसे हैं आप? आज का दिन कैसा रहा? Büro, meeting, lunch, office, taxi, online, app, call, message, whatsapp, facebook, instagram, youtube, google, whatsapp, zoom, meeting, call, message, status, update, post, photo, video, song, music, film, movie, ticket, train, bus, flight, hotel, room, food, dinner, breakfast, lunch, chai, coffee, roti, sabzi, dal, chawal, pyaaz, aaloo, tamatar, palak, paneer, chicken, mutton, fish, anda, doodh, pani, thanda, garam, thand, garmi, barish, mausam, din, raat, subah, shaam, kal, aaj, kal, agle, pichle, saal, mahina, hafta, ghanta, minute, second, baje, vaje, bajne, kya, kaise, kyun, kab, kahan, kaun, kisne, kiske, kiska, kiske, kitna, kitne, kitni, kahan se, kahan tak, kahan tak, thik hai, theek hai, nahi, haan, h nahi, nahi h, hai, hain, h, ho, hu, hota, hota hai, hui, huye, hua, karna, kiya, kiye, kiya h, kar raha, kar rahe, kar rahi, kar lo, kar le, karein, karenge, karega, karegi, kiya, kiya h, nahi kiya, hoga, hoga h, hoga na, ho sakta, ho sakta hai, ho sakta h, chahiye, chahiye h, chahiye na, hona chahiye, hona h, hona na, hona sakta, hona sakta hai, hona sakta h, jaana, jaa raha, jaa rahe, jaa rahi, aaya, aaye, aayi, aa raha, aa rahe, aa rahi, aa jao, aa lo, aa le, aa jaenge, aa jayega, aa jayegi, gaya, gaye, gayi, ja raha, ja rahe, ja rahi, jao, lo, le, lenge, lege, legi, liya, liye, liyi, le liya, le liye, le liyi, dekhna, dekha, dekhe, dekhi, dekho, dekh lo, dekh le, dekh lenge, dekh legi, dekh legi, liya h, liye h, liyi h, bolna, bola, bole, boli, bolo, bol lo, bol le, bol lenge, bol legi, bola h, bole h, boli h, sunna, suna, sune, suni, suno, sun lo, sun le, sun lenge, sun legi, suna h, sune h, suni h, likhna, likha, likhe, likhi, likho, likh lo, likh le, likh lenge, likh legi, likha h, likhe h, likhi h, khana, khaya, khaye, khayi, khao, kha lo, kha le, kha lenge, kha legi, khaya h, khaye h, khayi h, peena, piya, piye, piyi, pio, pi lo, pi le, pi lenge, pi legi, piya h, piye h, piyi h, jana, gaya, gaye, gayi, jao, ja lo, ja le, ja lenge, ja legi, gaya h, gaye h, gayi h, aana, aaya, aaye, aayi, ao, aa lo, aa le, aa lenge, aa legi, aaya h, aaye h, aayi h, hona, hua, hue, hui, ho, ho lo, ho le, ho lenge, ho legi, hua h, hue h, hui h, karna, kiya, kiye, kiya, karo, kar lo, kar le, kar lenge, kar legi, kiya h, kiye h, kiye h, dena, diya, diye, diyi, do, de lo, de le, de lenge, de legi, diya h, diye h, diyi h, lena, liya, liye, liyi, lo, le lo, le le, le lenge, le legi, liya h, liye h, liyi h, marna, mera, mare, mari, maro, mar lo, mar le, mar lenge, mar legi, mera h, mare h, mari h, jitna, jita, jite, jiti, jito, jit lo, jit le, jit lenge, jit legi, jita h, jite h, jiti h, harna, hara, hare, hari, haro, har lo, har le, har lenge, har legi, hara h, hare h, hari h, girna, giya, giye, giyI, giro, gira, gi lo, gi le, gi lenge, gi legi, giya h, giye h, giyI h, utarna, utra, utre, utri, utro, utra h, utre h, utri h, chadna, chadha, chadhe, chadhi, chadho, chadha h, chadhe h, chadhi h, dikhana, dikhaya, dikhaye, dikhadi, dikhao, dikh lo, dikh le, dikh lenge, dikh legi, dikhaya h, dikhaye h, dikhadi h, sunna, suna, sune, suni, suno, sun lo, sun le, sun lenge, sun legi, suna h, sune h, suni h, bolna, bola, bole, boli, bolo, bol lo, bol le, bol lenge, bol legi, bola h, bole h, boli h";
}

extern "C" JNIEXPORT jstring JNICALL
Java_app_personaldictation_mobile_DictationDevicePlugin_whisperTranscribe(JNIEnv *env, jclass, jstring path, jbyteArray audio, jstring language, jstring library_dir) {
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
        if (!backends_loaded) {
            const char *directory = env->GetStringUTFChars(library_dir, nullptr);
            std::string base(directory);
            env->ReleaseStringUTFChars(library_dir, directory);
            if (!ggml_backend_load((base + "/libggml-cpu.so").c_str())) {
                fail(env, "Cannot load offline CPU backend."); return nullptr;
            }
#if defined(DICTATION_VULKAN)
            if (!ggml_backend_load((base + "/libggml-vulkan.so").c_str())) {
                __android_log_print(ANDROID_LOG_INFO, "dictation-whisper", "Vulkan unavailable; using CPU.");
            }
#endif
            backends_loaded = true;
        }
        const char *filename = env->GetStringUTFChars(path, nullptr);
        auto parameters = whisper_context_default_params();
        whisper_log_set(whisper_log, nullptr);
        gpu_active = false;
        parameters.use_gpu = true;
        context = whisper_init_from_file_with_params(filename, parameters);
        if (!context) {
            parameters.use_gpu = false;
            gpu_active = false;
            context = whisper_init_from_file_with_params(filename, parameters);
        }
        env->ReleaseStringUTFChars(path, filename);
        if (!context) { fail(env, "Cannot load offline Whisper model. Download it again."); return nullptr; }
    }
    const char *lang = env->GetStringUTFChars(language, nullptr);
    std::string requested(lang); env->ReleaseStringUTFChars(language, lang);
    // Force Hindi when requested; explicit language prevents misdetection.
    if (requested == "hi" || requested == "hinglish") requested = "hi";
    if (requested != "auto" && whisper_lang_id(requested.c_str()) < 0) { fail(env, "Unsupported language."); return nullptr; }
    std::vector<float> pcm((size-44)/2);
    for (size_t i = 0; i < pcm.size(); ++i) pcm[i] = static_cast<int16_t>(le(wav, 44+i*2, 2)) / 32768.0f;
    auto params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    params.n_threads = std::max(1u, std::min(4u, std::thread::hardware_concurrency()));
    params.language = requested == "auto" ? nullptr : requested.c_str();
    params.translate = false; params.no_context = true;
    params.print_realtime = false; params.print_progress = false; params.print_timestamps = false; params.print_special = false;
    // Hindi/Hinglish initial prompt improves Devanagari script accuracy.
    if (requested == "hi") params.initial_prompt = HINDI_INITIAL_PROMPT;
    if (whisper_full(context, params, pcm.data(), static_cast<int>(pcm.size())) != 0) { fail(env, "Offline inference failed; audio remains queued."); return nullptr; }
    std::string text;
    for (int i = 0; i < whisper_full_n_segments(context); ++i) text += whisper_full_get_segment_text(context, i);
    const char *detected = whisper_lang_str(whisper_full_lang_id(context));
    // Log inference timings for GPU verification.
    auto *timings = whisper_get_timings(context);
    __android_log_print(ANDROID_LOG_INFO, "dictation-whisper", "inference: encode=%.1fms decode=%.1fms gpu=%s lang=%s",
        timings ? timings->encode_ms : -1, timings ? timings->decode_ms : -1, gpu_active ? "yes" : "no", detected ? detected : "auto");
    std::string json = "{\"text\":" + quote(text) + ",\"language\":" + quote(detected ? detected : "") +
        ",\"backend\":" + quote(gpu_active ? "vulkan" : "cpu") + "}";
    jbyteArray bytes = env->NewByteArray(json.size());
    env->SetByteArrayRegion(bytes, 0, json.size(), reinterpret_cast<const jbyte *>(json.data()));
    jclass stringClass = env->FindClass("java/lang/String");
    return static_cast<jstring>(env->NewObject(stringClass, env->GetMethodID(stringClass, "<init>", "([BLjava/lang/String;)V"), bytes, env->NewStringUTF("UTF-8")));
}
JNIEXPORT void JNICALL JNI_OnUnload(JavaVM *, void *) { if (context) whisper_free(context); context = nullptr; }
