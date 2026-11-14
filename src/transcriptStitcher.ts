const stopwords = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'to', 'of', 'in', 'on', 'at', 'for',
  'is', 'it', 'as', 'by', 'be', 'i', 'you', 'we', 'he', 'she', 'they', 'that', 'this',
  'है', 'हैं', 'का', 'की', 'के', 'में', 'को', 'से', 'और',
]);
const negations = new Set(['no', 'not', 'never', 'neither', 'nor', 'cannot', "can't", "don't", "doesn't", "didn't", "isn't", "wasn't", "won't", 'नहीं', 'नही', 'न', 'ना', 'मत', 'बिना']);
// Marks include Devanagari matras/nukta: never discard them from comparison tokens.
const normalize = (token: string) => token.normalize('NFC').toLowerCase()
  .replace(/^[^\p{L}\p{N}\p{M}]+|[^\p{L}\p{N}\p{M}]+$/gu, '');

/** Token edit distance: ASR can substitute, insert or omit words in shared audio. */
function editDistance(left: string[], right: string[]): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    const row = [i];
    for (let j = 1; j <= right.length; j++) {
      row[j] = Math.min(row[j - 1] + 1, previous[j] + 1,
        previous[j - 1] + (left[i - 1] && left[i - 1] === right[j - 1] ? 0 : 1));
    }
    previous = row;
  }
  return previous[right.length];
}

/**
 * Strong long-boundary evidence permits up to two recognition edits, not a
 * semantic rewrite. Require 80% similarity, three distinct content-word anchors
 * and an exact three-token ending to avoid swallowing a new continuation.
 * Do not use the wider tolerance to erase an added/removed negation.
 */
function longOverlap(tail: string[], head: string[]): number {
  for (let consumed = head.length; consumed >= 8; consumed--) {
    const prefix = head.slice(0, consumed);
    for (let length = Math.min(tail.length, consumed + 2); length >= Math.max(8, consumed - 2); length--) {
      const suffix = tail.slice(-length);
      if (!suffix.slice(-3).every((token, index) => token && token === prefix[prefix.length - 3 + index])) continue;
      if (suffix.filter(token => negations.has(token)).join('\0') !== prefix.filter(token => negations.has(token)).join('\0')) continue;
      const anchors = new Set(suffix.filter(token => token && !stopwords.has(token) && prefix.includes(token)));
      if (anchors.size < 3) continue;
      const budget = Math.min(2, Math.floor(Math.max(length, consumed) * 0.2));
      if (editDistance(suffix, prefix) <= budget) return consumed;
    }
  }
  return 0;
}

/**
 * A chunk can hallucinate a short tail after shared speech. The next chunk then
 * restarts inside recent text, rather than at its final word. Only accept exact
 * runs of at least five words with three distinct content anchors; never fuzzy
 * search the transcript or remove/rewrite already committed words.
 */
function restartedOverlap(recent: string[], head: string[]): number {
  for (let consumed = Math.min(15, recent.length, head.length); consumed >= 5; consumed--) {
    const prefix = head.slice(0, consumed);
    if (new Set(prefix.filter(token => token && !stopwords.has(token))).size < 3) continue;
    for (let trailing = 1; trailing <= 16 && consumed + trailing <= recent.length; trailing++) {
      const start = recent.length - trailing - consumed;
      const end = start + consumed;
      // Do not truncate a longer exact run at our search limit, or merge a
      // repeated clause whose continuation adds/removes a negation.
      if (head[consumed] && head[consumed] === recent[end]) continue;
      if (recent.slice(end).some(token => negations.has(token)) || head.slice(consumed).some(token => negations.has(token))) continue;
      if (prefix.every((token, index) => token && token === recent[start + index])) return consumed;
    }
  }
  return 0;
}

/** Longest boundary overlap; retain original spelling and punctuation in output. */
export function stitchTranscript(existing: string, incoming: string): string {
  const left = existing.trim();
  const right = incoming.trim();
  if (!left) return right;
  if (!right) return left;
  const original = right.split(/\s+/u);
  const recent = left.split(/\s+/u).slice(-32).map(normalize);
  const tail = recent.slice(-15);
  const head = original.slice(0, 15).map(normalize);
  let overlap = 0;
  for (let k = Math.min(tail.length, head.length); k >= 1; k--) {
    const suffix = tail.slice(-k);
    let matches = 0;
    let meaningfulMatches = 0;
    for (let i = 0; i < k; i++) {
      if (suffix[i] && suffix[i] === head[i]) {
        matches++;
        if (!stopwords.has(head[i])) meaningfulMatches++;
      }
    }
    // Short, common-word-only boundaries are too ambiguous to discard.
    if (meaningfulMatches > 0 && (matches === k || (k >= 3 && matches >= k - 1))) {
      overlap = k;
      break;
    }
  }
  overlap = Math.max(overlap, longOverlap(tail, head), restartedOverlap(recent, original.slice(0, 16).map(normalize)));
  const remainder = original.slice(overlap).join(' ');
  return remainder ? `${left} ${remainder}` : left;
}
