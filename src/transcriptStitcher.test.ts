import { describe, expect, it } from 'vitest';
import { stitchTranscript as stitch } from './transcriptStitcher';

describe('deterministic boundary stitching', () => {
  it('chooses the longest exact suffix-prefix overlap', () => {
    expect(stitch('We found bright red roses', 'bright red roses today.')).toBe('We found bright red roses today.');
    expect(stitch('say hello', 'hello again')).toBe('say hello again');
    expect(stitch('bright red', 'bright red roses')).toBe('bright red roses');
  });
  it('accepts one mismatched token for overlaps of at least three', () => {
    expect(stitch('We found bright red roses', 'bright read roses today.')).toBe('We found bright red roses today.');
    expect(stitch('bright red', 'bright read roses')).toBe('bright red bright read roses');
  });
  it('deduplicates the reported Hindi sentence despite two changed boundary words', () => {
    const existing = 'जहाँ उत्तर प्रदेश ने सूरत और गिफ्ट सिटी बना ली वहाँ आप प्रदेश का सबसे बड़ा एकनोमिक पावर हाउस होना चाहिए';
    const repeated = 'जहाँ उत्तर प्रदेश का सबसे बड़ा एकनोमिक पावर हाउस होना चाहिए';
    expect(stitch(existing, repeated)).toBe(existing);
    expect(stitch(existing, `${repeated} अगली बात सुनिए।`)).toBe(`${existing} अगली बात सुनिए।`);
  });
  it('aligns long overlaps with inserted or omitted recognition tokens', () => {
    const existing = 'We discussed the regional economic power house and future growth plans today.';
    expect(stitch(existing, 'the regional economic major power house and future growth plans today. Next topic.'))
      .toBe(`${existing} Next topic.`);
    expect(stitch(existing, 'the regional economic house and future growth plans today. Next topic.'))
      .toBe(`${existing} Next topic.`);
  });
  it('keeps long matches conservative when the ending, similarity or content anchors are weak', () => {
    const cases = [
      ['bright red roses grow beside the old stone bridge today', 'dark blue flowers grow beside the old stone bridge today'],
      ['and the and the and the and the and the', 'the and the and the and the and the and'],
      ['we need to approve this plan now', 'we must not approve this plan now'],
    ];
    // More than two edits and short overlaps must retain both passages.
    expect(stitch(cases[0][0], cases[0][1])).toBe(cases[0].join(' '));
    // A changed final word is not a safe long-overlap anchor (legacy one-edit matching still applies).
    expect(stitch('regional economic power house and future growth plans today',
      'different regional economic power house and future growth plans tomorrow'))
      .toBe('regional economic power house and future growth plans today different regional economic power house and future growth plans tomorrow');
    expect(stitch(cases[1][0], cases[1][1])).toBe(cases[1].join(' '));
    expect(stitch(cases[2][0], cases[2][1])).toBe(cases[2].join(' '));
  });
  it('does not use wider alignment to erase a newly inserted negation', () => {
    for (const [left, right] of [
      ['We really need to approve this regional development plan right now', 'We really need not to approve this regional development plan right now'],
      ['हमें आज इस प्रदेश का सबसे बड़ा एकनोमिक पावर हाउस बनाना चाहिए', 'हमें आज इस प्रदेश का सबसे बड़ा एकनोमिक पावर हाउस नहीं बनाना चाहिए'],
    ]) expect(stitch(left, right)).toBe(`${left} ${right}`);
  });
  it('removes an exact restart before a misrecognized tail in the Florence example', () => {
    const existing = 'And in the middle of this, one ordinary looking merchant is a man of the church.';
    expect(stitch(existing, 'One ordinary looking merchant is asking the pope for forgiveness.'))
      .toBe(`${existing} asking the pope for forgiveness.`);
    const lamps = 'Where in one festival, the temples and the rooftops were covered in lamps that burned day and night.';
    expect(stitch(lamps, 'Where in one festival, the of the West.'))
      .toBe(`${lamps} of the West.`);
  });
  it('handles punctuation, Hindi and fully repeated prefixes in recent restarts', () => {
    const existing = 'We visited the ancient stone temples beside the river. Extra tail.';
    expect(stitch(existing, 'THE ancient stone temples beside the river, Next topic.'))
      .toBe(`${existing} Next topic.`);
    expect(stitch(existing, 'the ancient stone temples beside the river.')).toBe(existing);
    const hindi = 'आज हमने पुराना लाल पत्थर का मंदिर देखा। गलत अंत।';
    expect(stitch(hindi, 'पुराना लाल पत्थर का मंदिर देखा, फिर घर गए।'))
      .toBe(`${hindi} फिर घर गए।`);
  });
  it('does not use weak, fuzzy or distant internal matches to delete new speech', () => {
    for (const [left, right] of [
      ['One ordinary looking merchant is a man of the church.', 'One ordinary looking scholar is asking for help.'],
      ['We saw bright red roses nearby yesterday.', 'bright red roses today.'],
      ['and the and the and the extra tail', 'and the and the and the next'],
      ['the bridge and the bridge and the bridge extra tail', 'the bridge and the bridge and the bridge collapsed'],
      [`one ordinary looking merchant is ${Array.from({ length: 17 }, (_, i) => `tail${i}`).join(' ')}`, 'one ordinary looking merchant is asking for help.'],
      ['we need to approve this plan now. Extra tail.', 'we need not to approve this plan now.'],
    ]) expect(stitch(left, right)).toBe(`${left} ${right}`);
  });
  it('does not drop short stopword-only matches', () => {
    expect(stitch('Turn it on', 'on Monday')).toBe('Turn it on on Monday');
    expect(stitch('and the', 'and the answer')).toBe('and the and the answer');
  });
  it('handles silence and zero overlap without losing text', () => {
    expect(stitch('', '  Hello!  ')).toBe('Hello!');
    expect(stitch('Hello!', '   ')).toBe('Hello!');
    expect(stitch('', '')).toBe('');
    expect(stitch('Blue skies.', 'Quiet rivers.')).toBe('Blue skies. Quiet rivers.');
    expect(stitch('---', '... hello')).toBe('--- ... hello');
  });
  it('normalizes edge punctuation and casing, preserving original punctuation', () => {
    expect(stitch('She said, “Hello, WORLD!”', 'hello world — Good morning!')).toBe('She said, “Hello, WORLD!” — Good morning!');
    expect(stitch('Café déjà vu.', 'CAFÉ déjà vu, magnifique!')).toBe('Café déjà vu. magnifique!');
  });
  it('deduplicates Hindi overlaps without stripping matras or danda punctuation', () => {
    expect(stitch('आज अच्छी बारिश हुई।', 'अच्छी बारिश हुई, फिर धूप निकली।'))
      .toBe('आज अच्छी बारिश हुई। फिर धूप निकली।');
    // These words differ only by a final vowel sign: they must not compare equal.
    expect(stitch('रुकी', 'रुका नहीं।')).toBe('रुकी रुका नहीं।');
    expect(stitch('कवि', 'कविता सुंदर है।')).toBe('कवि कविता सुंदर है।');
  });
  it('deduplicates Hinglish boundaries across Devanagari and Latin tokens', () => {
    expect(stitch('आज हमारी team meeting है।', 'TEAM meeting है, फिर lunch करेंगे।'))
      .toBe('आज हमारी team meeting है। फिर lunch करेंगे।');
  });
  it('preserves non-overlapping Hindi and common function-word boundaries', () => {
    expect(stitch('बच्चे मैदान में खेलते हैं।', 'मुझे संगीत सुनना पसंद है।'))
      .toBe('बच्चे मैदान में खेलते हैं। मुझे संगीत सुनना पसंद है।');
    for (const word of ['है', 'हैं', 'का', 'की', 'के', 'में', 'को', 'से', 'और']) {
      expect(stitch(`पहला ${word}।`, `${word} दूसरा वाक्य।`))
        .toBe(`पहला ${word}। ${word} दूसरा वाक्य।`);
    }
    expect(stitch('है और', 'है और आगे')).toBe('है और है और आगे');
  });
  it('compares NFC-equivalent tokens while preserving original display text', () => {
    expect(stitch('वह क़िला।', 'क़िला बहुत पुराना है।')).toBe('वह क़िला। बहुत पुराना है।');
    expect(stitch('Café', 'Cafe\u0301 noir')).toBe('Café noir');
  });
  it('does not search beyond fifteen tokens and does not append fully duplicated chunks', () => {
    const words = Array.from({ length: 16 }, (_, i) => `word${i}`).join(' ');
    expect(stitch(words, `${words} end`)).toBe(`${words} ${words} end`);
    expect(stitch('hello world', 'hello world')).toBe('hello world');
  });
});
