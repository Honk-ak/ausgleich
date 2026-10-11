import { describe, expect, it } from 'vitest';
import { ExpenseInput, exitPlan, settle, splitShares } from './settle';
import { cleanPaypal, cleanPaypalHandle, epcPayload, isValidIban, parseAmount, paypalKind, paypalMeLink } from './pay';

const all = (ids: string[]) => ids.map((memberId) => ({ memberId, weight: 1 }));
const people = ['anna', 'lisa', 'peter', 'tom'];

// Beispielrechnung aus dem Konzept, Abschnitt 15
const saturday: ExpenseInput[] = [
  { id: '1', amountCents: 6000, payerId: 'anna', participants: all(people), isTreat: false },
  { id: '2', amountCents: 2200, payerId: 'anna', participants: all(people), isTreat: false },
  { id: '3', amountCents: 2100, payerId: 'peter', participants: all(people), isTreat: true },
  { id: '4', amountCents: 2000, payerId: 'tom', participants: all(people), isTreat: false },
  { id: '5', amountCents: 1500, payerId: 'tom', participants: all(['tom', 'lisa']), isTreat: false },
  { id: '6', amountCents: 4800, payerId: 'lisa', participants: all(['anna', 'tom', 'lisa']), isTreat: false },
];

describe('Kassensturz', () => {
  it('rechnet das Konzeptbeispiel: zwei Zahlungen an Anna', () => {
    const r = settle('samstag', people, saturday, { mode: 'relaxed', roundingStepCents: 100, toleranceCents: 200 });
    expect(r.totalCents).toBe(18600);
    expect(r.sharedCents).toBe(16500);
    expect(r.paid).toEqual({ anna: 8200, lisa: 4800, peter: 2100, tom: 3500 });
    expect(r.balances).toEqual({ anna: 4050, lisa: -100, peter: -2550, tom: -1400 });
    const pay = Object.fromEntries(r.payments.map((p) => [`${p.from}>${p.to}`, p.amountCents]));
    expect(pay).toEqual({ 'peter>anna': 2600, 'tom>anna': 1400 });
    expect(r.advantage).toEqual({ anna: -50, lisa: 100, peter: -50, tom: 0 });
  });

  it('centgenau ergibt drei Zahlungen, die alle Salden auf null bringen', () => {
    const r = settle('samstag', people, saturday, { mode: 'exact', roundingStepCents: 1, toleranceCents: 0 });
    expect(r.payments).toHaveLength(3);
    for (const v of Object.values(r.advantage)) expect(v).toBe(0);
  });

  it('ist reproduzierbar und unabhängig von der Reihenfolge der Eingabe', () => {
    const s = { mode: 'relaxed' as const, roundingStepCents: null, toleranceCents: null };
    const a = settle('x', people, saturday, s);
    const b = settle('x', [...people].reverse(), [...saturday].reverse(), s);
    expect(b).toEqual(a);
  });

  it('findet getrennte Teilgruppen: zwei Zahlungen statt drei', () => {
    const e: ExpenseInput[] = [
      { id: 'a', amountCents: 1000, payerId: 'a', participants: all(['b']), isTreat: false },
      { id: 'b', amountCents: 2500, payerId: 'c', participants: all(['d']), isTreat: false },
    ];
    const r = settle('g', ['a', 'b', 'c', 'd'], e, { mode: 'exact', roundingStepCents: 1, toleranceCents: 0 });
    expect(r.payments).toHaveLength(2);
  });

  it('eine Person zahlt alles: alle anderen zahlen je einmal', () => {
    const e: ExpenseInput[] = [{ id: 'a', amountCents: 10000, payerId: 'anna', participants: all(people), isTreat: false }];
    const r = settle('g', people, e, { mode: 'relaxed', roundingStepCents: 100, toleranceCents: 200 });
    expect(r.payments).toHaveLength(3);
    expect(r.payments.every((p) => p.to === 'anna' && p.amountCents === 2500)).toBe(true);
  });

  it('Einladung wird nicht umgelegt', () => {
    const e: ExpenseInput[] = [{ id: 'a', amountCents: 2100, payerId: 'peter', participants: all(people), isTreat: true }];
    const r = settle('g', people, e, { mode: 'relaxed', roundingStepCents: 100, toleranceCents: 200 });
    expect(r.payments).toHaveLength(0);
    expect(r.paid.peter).toBe(2100);
  });

  it('Zufallsprüfung: Summen stimmen, Abweichung bleibt begrenzt', () => {
    let seed = 42;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let round = 0; round < 300; round++) {
      const n = 2 + Math.floor(rnd() * 7);
      const ids = Array.from({ length: n }, (_, i) => `m${i}`);
      const e: ExpenseInput[] = Array.from({ length: 1 + Math.floor(rnd() * 12) }, (_, i) => ({
        id: `e${i}`,
        amountCents: 50 + Math.floor(rnd() * 20000),
        payerId: ids[Math.floor(rnd() * n)],
        participants: ids.filter(() => rnd() > 0.3).map((memberId) => ({ memberId, weight: rnd() > 0.8 ? 2 : 1 })),
        isTreat: rnd() > 0.9,
      }));
      const step = [1, 50, 100][round % 3];
      const tol = step === 1 ? 0 : step * 2;
      const r = settle(`r${round}`, ids, e, { mode: 'balanced', roundingStepCents: step, toleranceCents: tol });
      expect(Object.values(r.balances).reduce((s, v) => s + v, 0)).toBe(0);
      expect(Object.values(r.advantage).reduce((s, v) => s + v, 0)).toBe(0);
      expect(r.payments.length).toBeLessThanOrEqual(Math.max(0, n - 1));
      for (const p of r.payments) expect(p.amountCents % step).toBe(0);
      const count: Record<string, number> = {};
      for (const p of r.payments) {
        count[p.from] = (count[p.from] ?? 0) + 1;
        count[p.to] = (count[p.to] ?? 0) + 1;
      }
      // Obergrenze: Toleranz (eigene oder mitgetragene) plus halbe Stufe je eigener Zahlung,
      // plus je Zahlung, die nach dem Runden unter die Toleranz fiel
      for (const id of ids) {
        const bound = 2 * tol + (n - 1) * (step / 2 + tol);
        expect(Math.abs(r.advantage[id])).toBeLessThanOrEqual(bound);
      }
      if (step === 1) for (const v of Object.values(r.advantage)) expect(v).toBe(0);
    }
  });
});

describe('Nachausgleich', () => {
  it('erledigte Zahlungen bleiben, nur die Differenz wird neu verteilt', () => {
    const s = { mode: 'relaxed' as const, roundingStepCents: 100, toleranceCents: 200 };
    const done = [{ from: 'peter', to: 'anna', amountCents: 2600 }];
    // Korrektur: Pizza kostete 60 statt 48 Euro
    const corrected = saturday.map((e) => (e.id === '6' ? { ...e, amountCents: 6000 } : e));
    const r = settle('samstag', people, corrected, s, done);
    expect(r.payments.find((p) => p.from === 'peter')).toBeUndefined();
    const sum = Object.values(r.advantage).reduce((a, b) => a + b, 0);
    expect(sum).toBe(0);
    for (const v of Object.values(r.advantage)) expect(Math.abs(v)).toBeLessThanOrEqual(300);
  });
  it('ohne Änderung entsteht kein neuer Ausgleich', () => {
    const s = { mode: 'relaxed' as const, roundingStepCents: 100, toleranceCents: 200 };
    const first = settle('samstag', people, saturday, s);
    const again = settle('samstag', people, saturday, s, first.payments);
    expect(again.payments).toHaveLength(0);
  });
});

describe('Vorzeitig gehen (Teilausgleich)', () => {
  const s = { mode: 'relaxed' as const, roundingStepCents: 100, toleranceCents: 200 };
  it('Peter geht: eine Zahlung an Anna, gerundet', () => {
    expect(exitPlan('peter', people, saturday, s)).toEqual([{ from: 'peter', to: 'anna', amountCents: 2600, exactCents: 2600 }]);
  });
  it('wer ungefähr ausgeglichen ist, geht ohne Zahlung', () => {
    expect(exitPlan('lisa', people, saturday, s)).toEqual([]);
  });
  it('wer vorn liegt, bekommt Geld von den anderen', () => {
    const plan = exitPlan('anna', people, saturday, s);
    expect(plan.every((p) => p.to === 'anna')).toBe(true);
    expect([4000, 4100]).toContain(plan.reduce((x, p) => x + p.amountCents, 0));
    expect(plan[0].from).toBe('peter');
  });
  it('danach rechnen die anderen weiter, Peter taucht nicht mehr auf', () => {
    const exit = exitPlan('peter', people, saturday, s);
    const later: ExpenseInput[] = [
      ...saturday,
      { id: '0', amountCents: 3000, payerId: 'tom', participants: all(['anna', 'lisa', 'tom']), isTreat: false },
      { id: '9', amountCents: 999, payerId: 'lisa', participants: all(['anna', 'lisa', 'tom']), isTreat: false },
    ];
    const r = settle('samstag', people, later, s, exit, ['peter']);
    expect(r.payments.some((p) => p.from === 'peter' || p.to === 'peter')).toBe(false);
    // Kontrolle centgenau: nach Teilausgleich und Kassensturz bleibt niemand weit weg von null
    const exact = settle('samstag', people, later, { mode: 'exact', roundingStepCents: 1, toleranceCents: 0 }, exit, ['peter']);
    expect(exact.payments.some((p) => p.from === 'peter' || p.to === 'peter')).toBe(false);
    for (const v of Object.values(exact.advantage)) expect(Math.abs(v)).toBeLessThanOrEqual(100);
  });
});

describe('Anteile', () => {
  it('verteilt Restcent vollständig und wandernd', () => {
    const parts = all(['a', 'b', 'c']);
    const first = splitShares(1000, parts, 0);
    const second = splitShares(1000, parts, 1);
    expect(Object.values(first).reduce((s, v) => s + v, 0)).toBe(1000);
    expect(first).not.toEqual(second);
  });
  it('rechnet Gewichte', () => {
    expect(splitShares(900, [{ memberId: 'a', weight: 2 }, { memberId: 'b', weight: 1 }], 0)).toEqual({ a: 600, b: 300 });
  });
});

describe('PayPal-Eingabe', () => {
  it('erkennt E-Mail, Handynummer und PayPal.Me-Namen', () => {
    expect(paypalKind('Anna@Example.de')).toBe('email');
    expect(paypalKind('+49 170 1234567')).toBe('phone');
    expect(paypalKind('paypal.me/AnnaBeispiel')).toBe('handle');
    expect(paypalKind('AnnaBeispiel')).toBe('handle');
    expect(paypalKind('???')).toBe(null);
    expect(cleanPaypal('Anna@Example.de ')).toBe('anna@example.de');
    expect(cleanPaypal('+49 (170) 123-4567')).toBe('+491701234567');
    expect(cleanPaypal('https://www.paypal.me/AnnaB/12')).toBe('AnnaB');
  });
});

describe('Zahlungswege', () => {
  it('prüft IBANs', () => {
    expect(isValidIban('DE89 3704 0044 0532 0130 00')).toBe(true);
    expect(isValidIban('DE89 3704 0044 0532 0130 01')).toBe(false);
    expect(isValidIban('AT61 1904 3002 3457 3201')).toBe(true);
  });
  it('baut den EPC-Text in der vorgeschriebenen Reihenfolge', () => {
    const text = epcPayload({ name: 'Anna Beispiel', iban: 'DE89 3704 0044 0532 0130 00', amountCents: 1400, purpose: 'Samstag Stuttgart' });
    expect(text.split('\n')).toEqual(['BCD', '002', '1', 'SCT', '', 'Anna Beispiel', 'DE89370400440532013000', 'EUR14.00', '', '', 'Samstag Stuttgart']);
  });
  it('baut PayPal.Me-Links', () => {
    expect(cleanPaypalHandle('https://paypal.me/AnnaB/')).toBe('AnnaB');
    expect(cleanPaypalHandle('anna b')).toBe('');
    expect(paypalMeLink('@AnnaB', 1400)).toBe('https://paypal.me/AnnaB/14EUR');
    expect(paypalMeLink('AnnaB', 1450)).toBe('https://paypal.me/AnnaB/14.50EUR');
  });
  it('liest Beträge', () => {
    expect(parseAmount('24')).toBe(2400);
    expect(parseAmount('24,5')).toBe(2450);
    expect(parseAmount('3.99 €')).toBe(399);
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('0')).toBeNull();
  });
});
