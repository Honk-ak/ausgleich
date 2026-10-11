// Vorschläge für „Wofür?“: lernen aus der Aktivität, passen zum Anlass, merken sich die eigenen Lieblingsbegriffe.
// Alles läuft auf dem Gerät, ohne KI und ohne Datenübertragung.

export const MAX_SUGGESTIONS = 10;

export const BASICS = ['Essen', 'Getränke', 'Eintritt', 'Fahrt', 'Eis', 'Einkauf', 'Parken', 'Kaffee', 'Tickets', 'Snacks'];

/** Kleiner Themenkatalog: erkannt an Wörtern in Titel oder Anlass. `key` wählt auch das passende Bild. */
export const THEMES: { key: string; name: string; words: string[]; items: string[] }[] = [
  { key: 'schiff', name: 'Schiff', words: ['schiff', 'boot', 'fähre', 'faehre', '*see', 'kreuzfahrt', '*meer', 'strand', 'ostsee', 'nordsee', 'neckar', 'rhein', 'segel', 'kanu'], items: ['Schiffsticket', 'Bordrestaurant', 'Kiosk'] },
  { key: 'berge', name: 'Berge', words: ['alpen', '*berg', 'wander', '*hütte', 'huette', 'gipfel', 'ski', 'alm', 'klettern', 'tour'], items: ['Hütte', 'Seilbahn', 'Parken'] },
  { key: 'fahrrad', name: 'Fahrrad', words: ['radtour', 'fahrrad', 'bike', 'radeln', 'velo', '*radtour', 'radfahr'], items: ['Radverleih', 'Reparatur', 'Biergarten'] },
  { key: 'stadt', name: 'Stadt', words: ['stadt', 'städte', 'staedte', 'museum', 'city', 'altstadt', 'shopping', 'markt'], items: ['Museum', 'Nahverkehr', 'Café'] },
  { key: 'abend', name: 'Essen & Abend', words: ['*abend', '*party', 'kneipe', 'bar', 'feier', 'geburtstag', 'konzert', 'essen', 'restaurant', 'pizza', 'grill', 'dinner', 'brunch'], items: ['Getränke', 'Taxi', 'Trinkgeld'] },
  { key: 'reise', name: 'Reise', words: ['*urlaub', '*reise', 'wochenende', 'trip', 'ferien', 'flughafen', 'fliegen', 'hotel'], items: ['Unterkunft', 'Tanken', 'Maut'] },
];

/**
 * Thema am Text erkennen: ein Wort beginnt mit einem Stichwort („Schiffsausflug“).
 * Stichwörter mit * dürfen auch am Wortende stehen („Bodensee“, „Feldberg“).
 */
export function themeFor(text: string): (typeof THEMES)[number] | null {
  const tokens = text.toLocaleLowerCase('de').split(/[^a-zäöüß]+/).filter(Boolean);
  const hit = (w: string, t: string) => (w.startsWith('*') ? t.startsWith(w.slice(1)) || t.endsWith(w.slice(1)) : t.startsWith(w));
  // Das erste passende Wort im Text entscheidet („Fahrradtour Neckartal“ → Fahrrad)
  for (const t of tokens) {
    const theme = THEMES.find((th) => th.words.some((w) => hit(w, t)));
    if (theme) return theme;
  }
  return null;
}

const KEY = 'fair.labels.v2';
const GENERAL = 'allgemein';
export const themeKey = (context: string) => themeFor(context)?.key ?? GENERAL;

type Store = Record<string, Record<string, number>>;
function readStore(): Store {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

/** Eigene Begriffe aus früheren Aktivitäten mit demselben Thema (nur auf diesem Gerät). */
export function personalLabels(key: string): Record<string, number> {
  return readStore()[key] ?? {};
}

export function rememberLabel(label: string, key: string) {
  const clean = label.trim();
  if (!clean) return;
  try {
    const store = readStore();
    const data = store[key] ?? {};
    const existing = Object.keys(data).find((k) => k.toLowerCase() === clean.toLowerCase()) ?? clean;
    data[existing] = (data[existing] ?? 0) + 1;
    // nicht endlos wachsen lassen: je Thema die 40 häufigsten behalten
    store[key] = Object.fromEntries(Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 40));
    localStorage.setItem(KEY, JSON.stringify(store));
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
 * 3. eigene Lieblingsbegriffe aus Aktivitäten mit demselben Thema, 4. Grundbegriffe. Doppelte zählen einmal. Beim Tippen wird gefiltert.
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
