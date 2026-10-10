// Freundliche Erinnerungen, die beim Öffnen der App erscheinen.
import { euro } from './core/pay';
import type { JoinRequest, Member, Payment } from './types';

export interface Reminder {
  key: string;
  aid: string;
  text: string;
  /** über der Frist: etwas deutlicher, aber freundlich */
  due: boolean;
  target: 'settle' | 'main';
  /** nur einmal zeigen (z. B. Hinweis auf Abschluss ohne Bestätigung) */
  once: boolean;
}

function dayText(ms: number): string {
  return new Date(ms).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function remindersFor(args: {
  aid: string;
  title: string;
  uid: string;
  myMemberId: string | null;
  members: Member[];
  payments: Payment[];
  requests: JoinRequest[];
  now?: number;
}): Reminder[] {
  const { aid, title, uid, myMemberId, members, payments, requests } = args;
  const now = args.now ?? Date.now();
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? '?';
  const me = myMemberId ? name(myMemberId) : '';
  const list: Reminder[] = [];

  for (const r of requests) {
    if (r.status !== 'pending' || r.requestedBy === uid || r.approvals.includes(uid)) continue;
    list.push({
      key: `req:${r.id}`,
      aid,
      text: `${r.name} möchte bei „${title}“ dabei sein. Bist du einverstanden?`,
      due: false,
      target: 'main',
      once: false,
    });
  }
  if (!myMemberId) return list;

  for (const p of payments) {
    const late = now > p.dueAt;
    const until = late ? `Geplant war bis ${dayText(p.dueAt)}.` : `Am besten bis ${dayText(p.dueAt)}.`;
    if (p.from === myMemberId && p.status === 'open') {
      list.push({
        key: `pay:${p.id}`,
        aid,
        text: late
          ? `Hallo ${me}, magst du ${name(p.to)} heute noch die ${euro(p.amountCents)} schicken (${title})? ${until}`
          : `Hallo ${me}, magst du ${name(p.to)} noch ${euro(p.amountCents)} schicken (${title})? ${until}`,
        due: late,
        target: 'settle',
        once: false,
      });
    }
    if (p.to === myMemberId && p.status === 'sent') {
      list.push({
        key: `confirm:${p.id}`,
        aid,
        text: `Hallo ${me}, ${name(p.from)} hat dir ${euro(p.amountCents)} geschickt (${title}). Sobald es angekommen ist, bestätige es bitte kurz, damit alles abgeschlossen ist.`,
        due: late,
        target: 'settle',
        once: false,
      });
    }
    if (p.status === 'closed' && (p.from === myMemberId || p.to === myMemberId) && p.closedBy !== uid) {
      list.push({
        key: `closed:${p.id}`,
        aid,
        text: `Zur Info: Die Zahlung ${name(p.from)} → ${name(p.to)} über ${euro(p.amountCents)} (${title}) wurde ohne Bestätigung abgeschlossen. Grund: „${p.closedReason ?? ''}“`,
        due: false,
        target: 'settle',
        once: true,
      });
    }
  }
  return list;
}

const SEEN = 'fair.seen.';
export function unseen(list: Reminder[]): Reminder[] {
  return list.filter((r) => {
    try {
      return !r.once || !localStorage.getItem(SEEN + r.key);
    } catch {
      return true;
    }
  });
}
export function markSeen(list: Reminder[]) {
  for (const r of list) {
    if (!r.once) continue;
    try {
      localStorage.setItem(SEEN + r.key, '1');
    } catch {
      /* egal */
    }
  }
}

/** Pro Sitzung nur einmal automatisch aufpoppen. */
export function shouldPopup(scope: string): boolean {
  try {
    if (sessionStorage.getItem('fair.popup.' + scope)) return false;
    sessionStorage.setItem('fair.popup.' + scope, '1');
  } catch {
    /* ohne Speicher trotzdem anzeigen */
  }
  return true;
}
