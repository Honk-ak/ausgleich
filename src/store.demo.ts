// Demo-Modus ohne Firebase (npm run demo): gleiche Schnittstelle wie store.ts, Daten nur im Arbeitsspeicher.
// Mit „Ansicht als …“ lässt sich ausprobieren, was andere Personen sehen (z. B. Zahlung bestätigen).
import { useEffect, useState } from 'react';
import type { SettlementOut } from './core/settle';
import type * as T from './types';
export * from './types';

interface Room {
  activity: T.Activity;
  members: T.Member[];
  expenses: T.Expense[];
  history: T.HistoryEntry[];
  payees: Record<string, T.Payee>;
  settlement: T.SettlementMeta | null;
  payments: T.Payment[];
  requests: T.JoinRequest[];
}
const ME = 'demo-user';
const rooms: Record<string, Room> = {};
let mine: T.MyActivity[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function useTick() {
  const [, set] = useState(0);
  useEffect(() => {
    const l = () => set((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
}
let counter = 0;
export const newId = () => `id${(++counter).toString().padStart(4, '0')}`;
export const isDemo = true;
export const useUid = () => ({ uid: ME, error: null as string | null });
export const useOnline = () => true;
export function useMyActivities(): T.MyActivity[] | null {
  useTick();
  return mine;
}
export function useSignals(_uid: string | null, aids: string[]): Record<string, T.Signals> {
  useTick();
  return Object.fromEntries(
    aids.filter((a) => rooms[a]).map((a) => [
      a,
      {
        activity: rooms[a].activity,
        myMemberId: (rooms[a].members.find((m) => m.uid === ME && !m.leftAt) ?? rooms[a].members.find((m) => m.uid === ME))?.id ?? null,
        members: rooms[a].members,
        payments: rooms[a].payments,
        requests: rooms[a].requests.filter((r) => r.status === 'pending'),
      },
    ]),
  );
}
export function useActivity(aid: string): T.ActivityData {
  useTick();
  const r = rooms[aid];
  const empty: T.ActivityData = { loading: false, denied: false, activity: null, members: [], expenses: [], deleted: [], history: [], payees: {}, settlement: null, payments: [], requests: [], pendingWrites: false };
  if (!r) return empty;
  const sorted = [...r.expenses].sort((a, b) => b.spentAt - a.spentAt);
  return {
    ...empty,
    activity: r.activity,
    members: [...r.members].sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }) || (a.id < b.id ? -1 : 1)),
    expenses: sorted.filter((e) => !e.deletedAt),
    deleted: sorted.filter((e) => e.deletedAt),
    history: [...r.history].sort((a, b) => b.at - a.at),
    payees: r.payees,
    settlement: r.settlement,
    payments: r.payments,
    requests: r.requests,
  };
}
export async function createActivity(
  uid: string,
  input: { title: string; myName: string; startsAt: number; endsAt: number; settings: T.Settings },
) {
  const aid = newId();
  const now = Date.now();
  rooms[aid] = {
    activity: { id: aid, title: input.title, topic: '', createdBy: uid, createdAt: now, startsAt: input.startsAt, endsAt: input.endsAt, duration: 'date', status: 'open', settings: input.settings, token: 'demo', memberUids: [uid], joinOpen: true },
    members: [{ id: uid, name: input.myName, uid, color: 0, role: 'organizer', createdAt: now }],
    expenses: [], history: [], payees: {}, settlement: null, payments: [], requests: [],
  };
  mine = [{ id: aid, title: input.title, topic: '', startsAt: input.startsAt, endsAt: input.endsAt, joinedAt: now, status: 'open', token: 'demo', names: [input.myName] }, ...mine];
  emit();
  return aid;
}
export function syncMyCopy(_uid: string, a: T.Activity, names: string[], status: T.MyActivity['status']) {
  const cur = mine.find((m) => m.id === a.id);
  if (cur && (cur.status !== status || cur.title !== a.title || cur.topic !== a.topic || cur.names.join() !== names.join() || cur.startsAt !== a.startsAt || (cur.endsAt ?? null) !== (a.endsAt ?? null) || (cur.doneAt ?? null) !== (a.doneAt ?? null) || (cur.picture ?? '') !== (a.picture ?? ''))) {
    mine = mine.map((m) => (m.id === a.id ? { ...m, title: a.title, topic: a.topic, status, names, startsAt: a.startsAt, endsAt: a.endsAt ?? null, doneAt: a.doneAt ?? null, picture: a.picture ?? '' } : m));
    emit();
  }
}
export async function readInvite() { return { title: 'Demo' }; }
export async function isMemberOf() { return true; }
export function useMyRequest(): T.JoinRequest | null | undefined { return null; }
export async function requestJoin() {}
export async function completeJoin() {}
export async function joinNow() { return true; }
export async function claimName(aid: string, uid: string, name: string, claimFree = false): Promise<{ kind: 'ok'; memberId: string } | { kind: 'taken' } | { kind: 'ask'; free: T.Member }> {
  const members = rooms[aid].members.filter((m) => !m.leftAt);
  const mine = members.find((m) => m.uid === uid);
  if (mine) return { kind: 'ok', memberId: mine.id };
  const twin = members.find((m) => m.name.trim().toLowerCase() === name.trim().toLowerCase());
  if (twin && twin.uid) return { kind: 'taken' };
  if (twin && !claimFree) return { kind: 'ask', free: twin };
  if (twin) {
    claimMember(aid, twin.id, uid);
    return { kind: 'ok', memberId: twin.id };
  }
  return { kind: 'ok', memberId: addSelf(aid, uid, name, members.length) };
}
export function renameMember(aid: string, memberId: string, name: string) {
  rooms[aid].members = rooms[aid].members.map((m) => (m.id === memberId ? { ...m, name } : m));
  emit();
}
export function setJoinOpen(aid: string, open: boolean) {
  rooms[aid].activity = { ...rooms[aid].activity, joinOpen: open };
  emit();
}
const markLeft = (aid: string, memberId: string) => {
  rooms[aid].members = rooms[aid].members.map((m) => (m.id === memberId ? { ...m, leftAt: Date.now(), leftBy: ME } : m));
};
export async function leaveGroup(aid: string, uid: string, memberId: string) {
  markLeft(aid, memberId);
  rooms[aid].activity = { ...rooms[aid].activity, memberUids: rooms[aid].activity.memberUids.filter((u) => u !== uid) };
  emit();
}
export function removeMember(aid: string, memberId: string) {
  markLeft(aid, memberId);
  emit();
}
export function leaveWithSettlement(aid: string, _uid: string, memberId: string, plan: SettlementOut['payments'], days: number) {
  markLeft(aid, memberId);
  rooms[aid].payments = [...rooms[aid].payments, ...plan.map((p) => ({ ...paymentDoc(p, 0, days), kind: 'exit' as const }))];
  emit();
}
export function requestName(aid: string, _uid: string, name: string, _memberUids: string[], count: number) {
  rooms[aid].members.push({ id: newId(), name, uid: null, color: count % 8, role: 'member', createdAt: Date.now() });
  emit();
}
export function approveRequest() {}
export function rejectRequest() {}
export function claimMember(aid: string, memberId: string, uid: string) {
  rooms[aid].members = rooms[aid].members.map((m) => (m.id === memberId ? { ...m, uid } : m));
  emit();
}
export function addSelf(aid: string, uid: string, name: string, count: number): string {
  const id = newId();
  rooms[aid].members.push({ id, name, uid, color: count % 8, role: 'member', createdAt: Date.now() });
  emit();
  return id;
}
/** Nur im Demo-Modus: so tun, als wäre man eine andere Person der Aktivität. */
export function demoActAs(aid: string, memberId: string) {
  rooms[aid].members = rooms[aid].members.map((m) => ({ ...m, uid: m.id === memberId ? ME : m.uid === ME ? null : m.uid }));
  emit();
}
function log(aid: string, entry: Omit<T.HistoryEntry, 'id' | 'at'>) {
  rooms[aid].history.push({ ...entry, id: newId(), at: Date.now() });
}
export function saveExpense(
  aid: string, uid: string, byName: string,
  input: Pick<T.Expense, 'amountCents' | 'label' | 'payerId' | 'participants' | 'isTreat' | 'source'>,
  existing: T.Expense | null, summary: string, reason: string | null,
) {
  const now = Date.now();
  const r = rooms[aid];
  if (existing) {
    r.expenses = r.expenses.map((e) => (e.id === existing.id ? { ...e, ...input, source: e.source, updatedAt: now, version: e.version + 1, ...(reason ? { reason, reasonVersion: e.version + 1 } : {}) } : e));
    log(aid, { expenseId: existing.id, action: 'update', byName, summary, reason });
  } else {
    const id = newId();
    r.expenses.push({ id, ...input, spentAt: now, createdBy: uid, createdAt: now, updatedAt: now, version: 1, deletedAt: null, ...(reason ? { reason, reasonVersion: 1 } : {}) });
    log(aid, { expenseId: id, action: 'create', byName, summary, reason });
  }
  emit();
}
export function setExpenseDeleted(aid: string, expense: T.Expense, deleted: boolean, byName: string, summary: string, reason: string | null) {
  rooms[aid].expenses = rooms[aid].expenses.map((e) => (e.id === expense.id ? { ...e, deletedAt: deleted ? Date.now() : null, version: e.version + 1 } : e));
  log(aid, { expenseId: expense.id, action: deleted ? 'delete' : 'restore', byName, summary, reason });
  emit();
}
export function updateActivity(aid: string, patch: Partial<Pick<T.Activity, 'settings' | 'topic' | 'status' | 'joinOpen' | 'title' | 'startsAt' | 'endsAt' | 'picture' | 'doneAt'>>) {
  rooms[aid].activity = { ...rooms[aid].activity, ...patch };
  emit();
}
export function savePayee(aid: string, memberId: string, payee: Omit<T.Payee, 'id'>, _mine?: boolean) {
  rooms[aid].payees = { ...rooms[aid].payees, [memberId]: { id: memberId, ...payee } };
  emit();
}
export const rememberedPayee = (): Omit<T.Payee, 'id'> | null => null;
function paymentDoc(p: SettlementOut['payments'][number], round: number, days: number): T.Payment {
  return { id: newId(), round, from: p.from, to: p.to, amountCents: p.amountCents, exactCents: p.exactCents, status: 'open', method: null, sentAt: null, receivedAt: null, closedAt: null, closedBy: null, closedReason: null, createdAt: Date.now(), dueAt: Date.now() + days * 86400000 };
}
function meta(uid: string, result: SettlementOut, round: number, days: number, confirmedAt: number): T.SettlementMeta {
  return { confirmedAt, confirmedBy: uid, updatedAt: Date.now(), round, inputHash: result.inputHash, stepCents: result.stepCents, toleranceCents: result.toleranceCents, totalCents: result.totalCents, balances: result.balances, advantage: result.advantage, dueAt: Date.now() + days * 86400000 };
}
export function confirmSettlement(aid: string, uid: string, result: SettlementOut, days: number) {
  const r = rooms[aid];
  r.settlement = meta(uid, result, 1, days, Date.now());
  r.payments = result.payments.map((p) => paymentDoc(p, 1, days));
  r.activity = { ...r.activity, status: result.payments.length ? 'settled' : 'done', joinOpen: false, ...(result.payments.length ? {} : { doneAt: Date.now() }) };
  emit();
}
export function recalcSettlement(aid: string, uid: string, m: T.SettlementMeta, payments: T.Payment[], result: SettlementOut, days: number) {
  const r = rooms[aid];
  r.payments = [...payments.filter((p) => p.status !== 'open' || p.kind === 'exit'), ...result.payments.map((p) => paymentDoc(p, m.round + 1, days))];
  r.settlement = meta(uid, result, m.round + 1, days, m.confirmedAt);
  r.activity = { ...r.activity, status: 'settled' };
  emit();
}
export function setPaymentStatus(aid: string, p: T.Payment, status: T.Payment['status'], extra: Partial<T.Payment> = {}) {
  const now = Date.now();
  rooms[aid].payments = rooms[aid].payments.map((x) =>
    x.id === p.id
      ? { ...x, status, ...extra, ...(status === 'sent' ? { sentAt: now } : {}), ...(status === 'open' ? { sentAt: null, method: null } : {}), ...(status === 'received' ? { receivedAt: now } : {}), ...(status === 'closed' ? { closedAt: now } : {}) }
      : x,
  );
  emit();
}
export function forgetActivity() {}
