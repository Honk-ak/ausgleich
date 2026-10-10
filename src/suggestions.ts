// Vorschläge für „Wofür?“: lernen aus der Aktivität, passen zum Anlass, merken sich die eigenen Lieblingsbegriffe.
// Alles läuft auf dem Gerät, ohne KI und ohne Datenübertragung.

export const MAX_SUGGESTIONS = 10;

export const BASICS = ['Essen', 'Getränke', 'Eintritt', 'Fahrt', 'Eis', 'Einkauf', 'Parken', 'Kaffee', 'Tickets', 'Snacks'];

/** Kleiner Themenkatalog: erkannt an Wörtern in Titel oder Anlass. */
export const THEMES: { name: string; words: string[]; items: string[] }[] = [
  { name: 'Berge', words: ['alpen', 'berg', 'wander', 'hütte', 'huette', 'gipfel', 'ski', 'alm'], items: ['Hütte', 'Seilbahn', 'Parken'] },
  { name: 'Schiff', words: ['schiff', 'boot', 'fähre', 'faehre', 'see', 'kreuzfahrt', 'bodensee', 'neckar', 'rhein'], items: ['Schiffsticket', 'Bordrestaurant', 'Kiosk'] },
  { name: 'Stadt', words: ['stadt', 'städte', 'staedte', 'museum', 'city', 'altstadt'], items: ['Museum', 'Nahverkehr', 'Café'] },
  { name: 'Fahrrad', words: ['rad', 'fahrrad', 'bike', 'radtour', 'radeln'], items: ['Radverleih', 'Reparatur', 'Biergarten'] },
  { name: 'Reise', words: ['urlaub', 'reise', 'wochenende', 'trip', 'ferien'], items: ['Unterkunft', 'Tanken', 'Maut'] },
  { name: 'Abend', words: ['abend', 'party', 'kneipe', 'bar', 'feier', 'geburtstag', 'konzert'], items: ['Getränke', 'Taxi', 'Snacks'] },
];

export function themeFor(text: string): (typeof THEMES)[number] | null {
  const t = text.toLowerCase();
  return THEMES.find((theme) => theme.words.some((w) => t.includes(w))) ?? null;
}

const KEY = 'fair.labels';

/** Eigene Begriffe aus früheren Aktivitäten (nur auf diesem Gerät). */
export function personalLabels(): Record<string, number> {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

export function rememberLabel(label: string) {
  const clean = label.trim();
  if (!clean) return;
  try {
    const data = personalLabels();
    const existing = Object.keys(data).find((k) => k.toLowerCase() === clean.toLowerCase()) ?? clean;
    data[existing] = (data[existing] ?? 0) + 1;
    // nicht endlos wachsen lassen: die 60 häufigsten behalten
    const top = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 60);
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(top)));
  } catch {
    /* ohne Speicher eben ohne Lernen */
  }
}

function byCount(labels: string[]): string[] {
  const count = new Map<string, { label: string; n: number; first: number }>();
  labels.forEach((l, i) => {
    const clean = l.trim();
    if (!clean) return;
    const k = clean.toLowerCase();
    const cur = count.get(k);
    if (cur) cur.n += 1;
    else count.set(k, { label: clean, n: 1, first: i });
  });
  return [...count.values()].sort((a, b) => b.n - a.n || a.first - b.first).map((v) => v.label);
}

/**
 * Reihenfolge: 1. Begriffe dieser Aktivität (häufigste zuerst), 2. bis zu drei Themenvorschläge,
 * 3. eigene Lieblingsbegriffe, 4. Grundbegriffe. Doppelte zählen einmal. Beim Tippen wird gefiltert.
 */
export function buildSuggestions(args: {
  activityLabels: string[];
  context: string;
  personal: Record<string, number>;
  typed?: string;
  max?: number;
}): string[] {
  const max = args.max ?? MAX_SUGGESTIONS;
  const theme = themeFor(args.context);
  const personal = Object.entries(args.personal)
    .sort((a, b) => b[1] - a[1])
    .map(([label]) => label);
  const ordered = [...byCount(args.activityLabels), ...(theme ? theme.items : []), ...personal, ...BASICS];
  const seen = new Set<string>();
  const unique = ordered.filter((l) => {
    const k = l.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const typed = (args.typed ?? '').trim().toLowerCase();
  if (!typed) return unique.slice(0, max);
  const starts = unique.filter((l) => l.toLowerCase().startsWith(typed));
  const contains = unique.filter((l) => !l.toLowerCase().startsWith(typed) && l.toLowerCase().includes(typed));
  return [...starts, ...contains].slice(0, max);
}
