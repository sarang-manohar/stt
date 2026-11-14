import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const revision = 'a8d002cfd879315632a579e73f0148d06959de36'; // whisper.cpp v1.7.6 (MIT)
const directory = resolve('android/app/src/main/cpp/vendor/whisper.cpp');
if (!existsSync(directory)) {
  mkdirSync(directory, { recursive: true });
  execFileSync('git', ['init', directory], { stdio: 'inherit' });
  execFileSync('git', ['-C', directory, 'remote', 'add', 'origin', 'https://github.com/ggml-org/whisper.cpp.git']);
  execFileSync('git', ['-C', directory, 'fetch', '--depth=1', 'origin', revision], { stdio: 'inherit' });
  execFileSync('git', ['-C', directory, 'checkout', '--detach', 'FETCH_HEAD'], { stdio: 'inherit' });
}
const head = execFileSync('git', ['-C', directory, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (head !== revision) throw new Error('Unexpected whisper.cpp revision; remove vendor/whisper.cpp and retry.');
console.log(`Whisper source ready: ${revision}`);
