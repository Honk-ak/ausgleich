import { describe, expect, it } from 'vitest';
import { buildSuggestions, personalLabels, rememberLabel, themeFor, themeKey } from './suggestions';

describe('Vorschläge', () => {
  it('ohne Daten: zehn Grundbegriffe', () => {
    const s = buildSuggestions({ activityLabels: [], context: '', personal: {} });
    expect(s).toHaveLength(10);
    expect(s[0]).toBe('Essen');
  });
  it('Begriffe der Aktivität kommen nach vorne, häufigste zuerst, ohne Doppelte', () => {
    const s = buildSuggestions({ activityLabels: ['Schiffsfahrt', 'Eis', 'schiffsfahrt', 'Pizza'], context: '', personal: {} });
    expect(s.slice(0, 3)).toEqual(['Schiffsfahrt', 'Eis', 'Pizza']);
    expect(s.filter((x) => x.toLowerCase() === 'eis')).toHaveLength(1);
    expect(s).toHaveLength(10);
  });
  it('erkennt das Thema am Anlass', () => {
    expect(themeFor('Alpenausflug Zugspitze')?.name).toBe('Berge');
    expect(themeFor('Schiffsausflug Neckar')?.name).toBe('Schiff');
    expect(themeFor('Ausflug mit Oma')).toBeNull();
    expect(themeFor('Bodensee')?.key).toBe('schiff');
    expect(themeFor('Fahrradtour Neckartal')?.key).toBe('fahrrad');
    expect(themeFor('Pizza bei Luigi')?.key).toBe('abend');
    expect(themeFor('Grad Celsius')).toBeNull();
    const s = buildSuggestions({ activityLabels: [], context: 'Alpenausflug', personal: {} });
    expect(s.slice(0, 3)).toEqual(['Hütte', 'Seilbahn', 'Parken']);
  });
  it('eigene Lieblingsbegriffe vor den Grundbegriffen', () => {
    const s = buildSuggestions({ activityLabels: [], context: '', personal: { Döner: 5, Kino: 2 } });
    expect(s.slice(0, 2)).toEqual(['Döner', 'Kino']);
  });
  it('filtert beim Tippen', () => {
    const s = buildSuggestions({ activityLabels: ['Schiffsfahrt'], context: 'Schiff', personal: {}, typed: 'sch' });
    expect(s).toEqual(['Schiffsfahrt', 'Schiffsticket']);
  });
  it('gelernte Begriffe bleiben bei ihrem Thema', () => {
    const mem: Record<string, string> = {};
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => mem[k] ?? null,
      setItem: (k: string, v: string) => void (mem[k] = v),
    } as Storage;
    rememberLabel('Seilbahn', themeKey('Bergtour Zugspitze'));
    rememberLabel('Gondel', themeKey('Bergtour Zugspitze'));
    expect(Object.keys(personalLabels(themeKey('Schiffsausflug')))).toEqual([]);
    expect(Object.keys(personalLabels(themeKey('Wanderung Alb')))).toEqual(['Seilbahn', 'Gondel']);
    const ship = buildSuggestions({ activityLabels: [], context: 'Schiffsausflug', personal: personalLabels(themeKey('Schiffsausflug')) });
    expect(ship).not.toContain('Seilbahn');
  });
});
