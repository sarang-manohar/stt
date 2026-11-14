// Requires ImageMagick's `convert`. All launcher/PWA art comes from the UI mark.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const source = await readFile(new URL('../public/icon.svg', import.meta.url), 'utf8');
const res = new URL('../android/app/src/main/res/', import.meta.url);
const foreground = source.replace(/<rect\b[^>]*\/>/, '');
function render(svg, size, destination) {
  const result = spawnSync('convert', ['-background', 'none', 'svg:-', '-resize', `${size}x${size}`, `PNG32:${destination.pathname}`], { input: svg, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'ImageMagick convert failed');
}
for (const size of [192, 512]) render(source, size, new URL(`../public/icon-${size}.png`, import.meta.url));
render(source.replace(' rx="112"', ''), 512, new URL('../public/icon-maskable.png', import.meta.url));
for (const [density, size, foregroundSize] of [['mdpi', 48, 108], ['hdpi', 72, 162], ['xhdpi', 96, 216], ['xxhdpi', 144, 324], ['xxxhdpi', 192, 432]]) {
  const directory = new URL(`mipmap-${density}/`, res);
  await mkdir(directory, { recursive: true });
  render(source, size, new URL('ic_launcher.png', directory));
  render(source.replace('rx="112"', 'rx="256"'), size, new URL('ic_launcher_round.png', directory));
  render(foreground, foregroundSize, new URL('ic_launcher_foreground.png', directory));
}
// Replace Android Studio's unused template drawables too, so no alternate
// launcher configuration can accidentally fall back to the stock Android mark.
const wavePath = source.match(/<path d="([^"]+)"/)[1];
await writeFile(new URL('drawable-v24/ic_launcher_foreground.xml', res), `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="512" android:viewportHeight="512"><path android:fillColor="#00000000" android:strokeColor="#ffffff" android:strokeWidth="24" android:strokeLineCap="round" android:pathData="${wavePath}"/></vector>\n`);
await writeFile(new URL('drawable/ic_launcher_background.xml', res), '<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="@color/ic_launcher_background"/></shape>\n');
await writeFile(new URL('values/ic_launcher_background.xml', res), '<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="ic_launcher_background">#6254dc</color></resources>\n');
console.log('Generated web and Android icons from public/icon.svg');
