// Rechenkern: reine Funktionen, keine Netz- oder Datenbankzugriffe.
// Alle Beträge sind ganze Cent.

export type Mode = 'relaxed' | 'balanced' | 'exact';

export interface Share {
  memberId: string;
  weight: number;
}

export interface ExpenseInput {
  id: string;
  amountCents: number;
  payerId: string;
  participants: Share[];
  isTreat: boolean;
}

export interface SettingsInput {
  mode: Mode;
  /** null = intelligent runden; 1 = centgenau */
  roundingStepCents: number | null;
  /** null = aus der Rundung abgeleitet */
  toleranceCents: number | null;
}

export interface PaymentOut {
  from: string;
  to: string;
  amountCents: number;
  exactCents: number;
}

export interface SettlementOut {
  totalCents: number;
  sharedCents: number;
  /** was jede Person bezahlt hat, Einladungen eingeschlossen */
  paid: Record<string, number>;
  /** exakter Saldo: bezahlt minus eigener Anteil (ohne Einladungen) */
  balances: Record<string, number>;
  payments: PaymentOut[];
  /** Vorteil (+) oder Nachteil (-) je Person gegenüber der centgenauen Rechnung */
  advantage: Record<string, number>;
  stepCents: number;
  toleranceCents: number;
  inputHash: string;
}

/** FNV-1a, 32 Bit. Fest und reproduzierbar. */
export function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function rotate<T>(list: T[], start: number): T[] {
  if (list.length === 0) return list;
  const s = ((start % list.length) + list.length) % list.length;
  return [...list.slice(s), ...list.slice(0, s)];
}

/** Verteilt einen Betrag nach Gewichten. Restcent nach größtem Bruchteil, bei Gleichstand wandernd. */
export function splitShares(amountCents: number, participants: Share[], rotation: number): Record<string, number> {
  const parts = participants.filter((p) => p.weight > 0);
  const result: Record<string, number> = {};
  if (parts.length === 0) return result;
  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  const ordered = rotate(
    [...parts].sort((a, b) => (a.memberId < b.memberId ? -1 : 1)),
    rotation,
  );
  const rows = ordered.map((p, index) => {
    const raw = (amountCents * p.weight) / totalWeight;
    const base = Math.floor(raw + 1e-9);
    return { id: p.memberId, base, frac: raw - base, index };
  });
  let rest = amountCents - rows.reduce((s, r) => s + r.base, 0);
  const byFraction = [...rows].sort((a, b) => b.frac - a.frac || a.index - b.index);
  for (const r of byFraction) {
    if (rest <= 0) break;
    r.base += 1;
    rest -= 1;
  }
  for (const r of rows) result[r.id] = r.base;
  return result;
}

/** Vorschlag für „intelligent runden“: hängt am durchschnittlichen Anteil pro Person. */
export function resolveRounding(settings: SettingsInput, sharedCents: number, people: number) {
  let step = settings.roundingStepCents;
  if (step == null) {
    const average = people > 0 ? sharedCents / people : 0;
    step = average < 2000 ? 50 : average <= 15000 ? 100 : 500;
  }
  step = Math.max(1, Math.round(step));
  let tolerance = settings.toleranceCents;
  if (tolerance == null) tolerance = step <= 1 ? 0 : step * 2;
  return { stepCents: step, toleranceCents: Math.max(0, Math.round(tolerance)) };
}

function roundTo(value: number, step: number, tieUp: boolean): number {
  if (step <= 1) return value;
  const lower = Math.floor(value / step) * step;
  const diff = value - lower;
  if (diff * 2 < step) return lower;
  if (diff * 2 > step) return lower + step;
  return tieUp ? lower + step : lower;
}

/** Zerlegt die Personen in möglichst viele Teilgruppen, die sich untereinander genau ausgleichen. */
function zeroSumGroups(ids: string[], balance: Record<string, number>): string[][] {
  const k = ids.length;
  if (k === 0) return [];
  if (k > 12) return [ids];
  const size = 1 << k;
  const sums = new Int32Array(size);
  const dp = new Int8Array(size);
  for (let mask = 1; mask < size; mask++) {
    const low = mask & -mask;
    const i = 31 - Math.clz32(low);
    sums[mask] = sums[mask ^ low] + balance[ids[i]];
    let best = 0;
    for (let j = 0; j < k; j++) {
      if (mask & (1 << j)) best = Math.max(best, dp[mask ^ (1 << j)]);
    }
    dp[mask] = best + (sums[mask] === 0 ? 1 : 0);
  }
  const groups: string[][] = [];
  let mask = size - 1;
  while (mask) {
    const low = mask & -mask;
    let chosen = mask;
    if (dp[mask] > 1) {
      for (let sub = mask; sub; sub = (sub - 1) & mask) {
        if (!(sub & low) || sub === mask) continue;
        if (sums[sub] === 0 && dp[sub] === 1 && dp[mask ^ sub] === dp[mask] - 1) {
          chosen = sub;
          break;
        }
      }
    }
    groups.push(ids.filter((_, i) => chosen & (1 << i)));
    mask ^= chosen;
  }
  return groups;
}

export function settle(
  activityId: string,
  memberIds: string[],
  expenses: ExpenseInput[],
  settings: SettingsInput,
  /** bereits geleistete Zahlungen (Nachausgleich): werden vor der Berechnung verrechnet */
  transfers: { from: string; to: string; amountCents: number }[] = [],
): SettlementOut {
  const seed = hash(activityId);
  const ids = [...memberIds].sort();
  const known = new Set(ids);
  const paid: Record<string, number> = {};
  const balance: Record<string, number> = {};
  for (const id of ids) {
    paid[id] = 0;
    balance[id] = 0;
  }

  // 1 + 2: Anteile und Salden
  const sorted = [...expenses].sort((a, b) => (a.id < b.id ? -1 : 1));
  let totalCents = 0;
  let sharedCents = 0;
  sorted.forEach((e, index) => {
    if (!known.has(e.payerId) || e.amountCents <= 0) return;
    totalCents += e.amountCents;
    paid[e.payerId] += e.amountCents;
    if (e.isTreat) return;
    const parts = e.participants.filter((p) => known.has(p.memberId));
    const shares = splitShares(e.amountCents, parts, seed + index);
    if (Object.keys(shares).length === 0) return;
    sharedCents += e.amountCents;
    balance[e.payerId] += e.amountCents;
    for (const [id, cents] of Object.entries(shares)) balance[id] -= cents;
  });
  const exact = { ...balance };
  for (const t of transfers) {
    if (!known.has(t.from) || !known.has(t.to)) continue;
    balance[t.from] += t.amountCents;
    balance[t.to] -= t.amountCents;
  }

  const { stepCents, toleranceCents } = resolveRounding(settings, sharedCents, ids.length);

  // 3: Kleinigkeiten weglassen, den offenen Rest gleichmäßig auf die Übrigen verteilen
  const small = ids.filter((id) => balance[id] !== 0 && Math.abs(balance[id]) < toleranceCents);
  let rest = 0;
  for (const id of small) {
    rest += balance[id];
    balance[id] = 0;
  }
  const others = rotate(
    ids.filter((id) => balance[id] !== 0),
    seed,
  );
  if (rest !== 0 && others.length > 0) {
    const base = Math.trunc(rest / others.length);
    let extra = rest - base * others.length;
    for (const id of others) {
      balance[id] += base;
      if (extra !== 0) {
        balance[id] += Math.sign(extra);
        extra -= Math.sign(extra);
      }
    }
  }

  // 4: möglichst wenige Zahlungen
  const open = ids.filter((id) => balance[id] !== 0);
  const raw: PaymentOut[] = [];
  for (const group of zeroSumGroups(open, balance)) {
    const b: Record<string, number> = {};
    for (const id of group) b[id] = balance[id];
    for (let guard = 0; guard < group.length; guard++) {
      let giver = '';
      let taker = '';
      for (const id of group) {
        if (b[id] < 0 && (giver === '' || b[id] < b[giver])) giver = id;
        if (b[id] > 0 && (taker === '' || b[id] > b[taker])) taker = id;
      }
      if (!giver || !taker) break;
      const x = Math.min(-b[giver], b[taker]);
      raw.push({ from: giver, to: taker, amountCents: x, exactCents: x });
      b[giver] += x;
      b[taker] -= x;
    }
  }

  // 5: runden und protokollieren
  const payments: PaymentOut[] = [];
  for (const p of raw) {
    const tieUp = (hash(`${seed}|${p.from}|${p.to}`) & 1) === 1;
    let amount = roundTo(p.exactCents, stepCents, tieUp);
    if (amount < toleranceCents) amount = 0;
    if (amount > 0) payments.push({ ...p, amountCents: amount });
  }
  const advantage: Record<string, number> = {};
  for (const id of ids) advantage[id] = 0 - exact[id];
  for (const p of [...transfers.filter((t) => known.has(t.from) && known.has(t.to)), ...payments]) {
    advantage[p.from] -= p.amountCents;
    advantage[p.to] += p.amountCents;
  }

  const inputHash = hash(
    JSON.stringify([
      ids,
      sorted.map((e) => [e.id, e.amountCents, e.payerId, e.isTreat, e.participants.map((p) => [p.memberId, p.weight])]),
      settings.mode,
      stepCents,
      toleranceCents,
    ]),
  ).toString(16);

  return { totalCents, sharedCents, paid, balances: exact, payments, advantage, stepCents, toleranceCents, inputHash };
}
