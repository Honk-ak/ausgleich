import { describe, expect, it } from 'vitest';
import { buildSuggestions, themeFor } from './suggestions';

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
});
