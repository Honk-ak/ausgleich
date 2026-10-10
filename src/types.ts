// Gemeinsame Datentypen für Firebase- und Demo-Speicher.
import type { Mode, Share } from './core/settle';

/** Änderungen ohne Begründung sind nur so lange nach dem Eintragen möglich. */
export const EDIT_WINDOW_MS = 12 * 60 * 60 * 1000;

export interface Settings {
  mode: Mode;
  roundingStepCents: number | null;
  toleranceCents: number | null;
  paymentMethods: string[];
  /** Frist in Tagen für Zahlen und Bestätigen */
  reminderDays: number;
}
export interface Activity {
  id: string;
  title: string;
  topic: string;
  createdBy: string;
  createdAt: number;
  startsAt: number;
  endsAt: number | null;
  duration: string;
  status: 'open' | 'settled' | 'done';
  settings: Settings;
  token: string;
  memberUids: string[];
  /** „Tür offen“: Wer den QR-Code scannt, ist ohne Zustimmung sofort dabei. */
  joinOpen?: boolean;
}
export interface Member {
  id: string;
  name: string;
  uid: string | null;
  color: number;
  role: 'organizer' | 'member';
  createdAt: number;
  /** ausgeschieden seit (vorzeitig gegangen oder entfernt) */
  leftAt?: number | null;
  leftBy?: string | null;
}
export interface Expense {
  id: string;
  amountCents: number;
  label: string;
  payerId: string;
  participants: Share[];
  isTreat: boolean;
  source: 'manual' | 'quick_all';
  spentAt: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  version: number;
  deletedAt: number | null;
  reason?: string;
  reasonVersion?: number;
}
export interface HistoryEntry {
  id: string;
  expenseId: string;
  action: 'create' | 'update' | 'delete' | 'restore';
  byName: string;
  at: number;
  summary: string;
  reason: string | null;
}
export interface Payee {
  id: string;
  holder: string;
  iban: string;
  paypal: string;
}
export interface Payment {
  id: string;
  round: number;
  from: string;
  to: string;
  amountCents: number;
  exactCents: number;
  status: 'open' | 'sent' | 'received' | 'closed';
  method: string | null;
  sentAt: number | null;
  receivedAt: number | null;
  closedAt: number | null;
  closedBy: string | null;
  closedReason: string | null;
  createdAt: number;
  /** bis wann gezahlt bzw. bestätigt sein soll */
  dueAt: number;
  /** 'exit': Teilausgleich, weil jemand vorzeitig gegangen ist */
  kind?: 'exit';
}
export interface SettlementMeta {
  confirmedAt: number;
  confirmedBy: string;
  updatedAt: number;
  round: number;
  inputHash: string;
  stepCents: number;
  toleranceCents: number;
  totalCents: number;
  balances: Record<string, number>;
  advantage: Record<string, number>;
  dueAt: number;
}
export interface JoinRequest {
  id: string;
  kind: 'join' | 'name';
  uid: string | null;
  name: string;
  token: string | null;
  at: number;
  approvals: string[];
  status: 'pending' | 'approved' | 'rejected';
  rejectedBy: string | null;
  requestedBy: string;
}
export interface MyActivity {
  id: string;
  title: string;
  topic: string;
  startsAt: number;
  joinedAt: number;
  status: 'pending' | 'open' | 'settled' | 'done';
  token: string;
  names: string[];
  hidden?: boolean;
}
export interface Signals {
  myMemberId: string | null;
  members: Member[];
  payments: Payment[];
  requests: JoinRequest[];
}
export interface ActivityData {
  loading: boolean;
  denied: boolean;
  activity: Activity | null;
  members: Member[];
  expenses: Expense[];
  deleted: Expense[];
  history: HistoryEntry[];
  payees: Record<string, Payee>;
  settlement: SettlementMeta | null;
  payments: Payment[];
  requests: JoinRequest[];
  pendingWrites: boolean;
}

/** Noch dabei (nicht ausgeschieden) */
export const isActive = (m: Member) => !m.leftAt;

/** Kommt die Person in einer Ausgabe vor (auch gelöschte)? Dann geht Austreten nur mit Teilausgleich. */
export function isInvolved(memberId: string, expenses: Expense[]): boolean {
  return expenses.some((e) => e.payerId === memberId || e.participants.some((p) => p.memberId === memberId && p.weight > 0));
}

/** Zahlungen, die vor der Berechnung verrechnet werden: Teilausgleiche immer, sonst nur gemeldete/erledigte. */
export function countedTransfers(payments: Payment[], afterSettlement: boolean) {
  return payments
    .filter((p) => p.kind === 'exit' || (afterSettlement && p.status !== 'open'))
    .map((p) => ({ from: p.from, to: p.to, amountCents: p.amountCents }));
}
