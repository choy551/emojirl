import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const TOC = [
  'getting-started',
  'controls',
  'classes',
  'combat-stats',
  'items',
  'cooking-drinks',
  'shops',
  'tiles',
  'pressure',
  'emojicb',
  'bestiary',
];

describe('RTFM sections and table of contents', () => {
  const manual = readFileSync(new URL('./how-to-play.tsx', import.meta.url), 'utf8');

  it('anchors every section and lists them in the same order', () => {
    const listed = [...manual.matchAll(/\{ id: "([^"]+)", label:/g)].map((match) => match[1]);
    const rendered = [...manual.matchAll(/<Section id="([^"]+)"/g)].map((match) => match[1]);
    expect(listed).toEqual(TOC);
    expect(rendered).toEqual(TOC);
    expect(manual).toContain('data-testid="rtfm-toc"');
    expect(manual).toContain('data-testid="rtfm-toc-toggle"');
    expect(manual).toContain('lg:hidden');
    expect(manual).toContain('sticky top-6');
    expect(manual).toContain('scrollIntoView');
    expect(manual).toContain('aria-current={active ? "location" : undefined}');
  });

  it('keeps the existing rule blurbs after the regroup', () => {
    for (const name of [
      'emojiCityRulesBlurb()',
      'voidExtrasRulesBlurb()',
      'goldSink2RulesBlurb()',
      'goldSinkRulesBlurb()',
      'foodSinkRulesBlurb()',
      'farmerRulesBlurb()',
      'softCapRulesBlurb()',
      'blinkStrikeRulesBlurb',
    ]) {
      expect(manual).toContain(name);
    }
    expect(manual).toContain('Hollow Market and grace');
    expect(manual).toContain('Blood Auction');
    expect(manual).toContain('×3 at 25%');
    expect(manual).toContain('visible hostile still cancels it');
    expect(manual).toContain('from D:28 on, Dungeon Pressure is doubled');
    expect(manual).toContain('D:16 = +3/+2');
  });

  it('documents the Blink Strike talent tiers', () => {
    expect(manual).toContain('all eight');
    expect(manual).toContain('T5+');
    expect(manual).toContain('Endless Chain removes that cap');
    expect(manual).toContain('Blink Truestrike ignores this');
    expect(manual).not.toContain('all six');
    expect(manual).not.toContain('T4+');
    expect(manual).not.toContain('Longer Chain');
  });
});
