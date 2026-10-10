// Datenzugriff: Firebase Auth (anonym) und Firestore mit Offline-Speicher.
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { firebaseConfig } from './firebase-config';
import type { Mode, Share, SettlementOut } from './core/settle';
import type * as T from './types';
export * from './types';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

/** Feste, neutrale Reihenfolge: alphabetisch, keine Rangliste nach Beträgen. */
export const byName = (a: T.Member, b: T.Member) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }) || (a.id < b.id ? -1 : 1);

export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(15));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20);
}
function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const act = (aid: string) => doc(db, 'activities', aid);
const sub = (aid: string, name: string) => collection(db, 'activities', aid, name);
const subDoc = (aid: string, name: string, id: string) => doc(db, 'activities', aid, name, id);

/** Schreiben ohne zu warten: Firestore legt die Änderung lokal ab und lädt sie hoch, sobald Netz da ist. */
function later(promise: Promise<unknown>) {
  promise.catch((error) => console.error('Speichern fehlgeschlagen', error));
}

export function useUid(): { uid: string | null; error: string | null } {
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [error, setError] = useState<string | null>(null);
  useEffect(
    () =>
      onAuthStateChanged(auth, (user) => {
        if (user) setUid(user.uid);
        else signInAnonymously(auth).catch((e) => setError(String(e?.code ?? e)));
      }),
    [],
  );
  return { uid, error };
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function useMyActivities(uid: string | null): T.MyActivity[] | null {
  const [list, setList] = useState<T.MyActivity[] | null>(null);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(collection(db, 'users', uid, 'activities'), (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, names: [], topic: '', ...d.data() }) as unknown as T.MyActivity).filter((a) => !a.hidden);
      setList(rows.sort((a, b) => (b.startsAt || b.joinedAt) - (a.startsAt || a.joinedAt)));
    });
  }, [uid]);
  return list;
}

/** Offene Zahlungen und Beitrittsanfragen aus allen laufenden Aktivitäten, für die Erinnerungen. */
export function useSignals(uid: string | null, aids: string[]): Record<string, T.Signals> {
  const [signals, setSignals] = useState<Record<string, T.Signals>>({});
  const key = aids.join(',');
  useEffect(() => {
    if (!uid) return;
    const stops: (() => void)[] = [];
    for (const aid of aids) {
      const patch = (part: Partial<T.Signals>) =>
        setSignals((s) => {
          const base: T.Signals = s[aid] ?? { myMemberId: null, members: [], payments: [], requests: [] };
          return { ...s, [aid]: { ...base, ...part } };
        });
      const ignore = () => undefined;
      stops.push(
        onSnapshot(sub(aid, 'members'), (snap) => {
          const members = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T.Member);
          patch({ members, myMemberId: members.find((m) => m.uid === uid)?.id ?? null });
        }, ignore),
        onSnapshot(sub(aid, 'payments'), (snap) => patch({ payments: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T.Payment) }), ignore),
        onSnapshot(query(sub(aid, 'requests'), where('status', '==', 'pending')), (snap) =>
          patch({ requests: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T.JoinRequest) }), ignore),
      );
    }
    return () => stops.forEach((s) => s());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, key]);
  return signals;
}

export function useActivity(aid: string, uid: string | null): T.ActivityData {
  const [activity, setActivity] = useState<T.Activity | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [members, setMembers] = useState<T.Member[]>([]);
  const [allExpenses, setAllExpenses] = useState<T.Expense[]>([]);
  const [pendingWrites, setPendingWrites] = useState(false);
  const [history, setHistory] = useState<T.HistoryEntry[]>([]);
  const [payees, setPayees] = useState<Record<string, T.Payee>>({});
  const [settlement, setSettlement] = useState<T.SettlementMeta | null>(null);
  const [payments, setPayments] = useState<T.Payment[]>([]);
  const [requests, setRequests] = useState<T.JoinRequest[]>([]);

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    setDenied(false);
    const fail = () => {
      setDenied(true);
      setLoading(false);
    };
    const quiet = () => undefined;
    const stopActivity = onSnapshot(
      act(aid),
      (snap) => {
        setActivity(snap.exists() ? ({ id: snap.id, topic: '', ...snap.data() } as T.Activity) : null);
        setLoading(false);
      },
      fail,
    );
    const stops = [
      stopActivity,
      onSnapshot(sub(aid, 'members'), (snap) =>
        setMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T.Member).sort(byName)), quiet),
      onSnapshot(sub(aid, 'expenses'), { includeMetadataChanges: true }, (snap) => {
        setAllExpenses(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T.Expense).sort((a, b) => b.spentAt - a.spentAt));
        setPendingWrites(snap.metadata.hasPendingWrites);
      }, quiet),
      onSnapshot(sub(aid, 'history'), (snap) =>
        setHistory(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T.HistoryEntry).sort((a, b) => b.at - a.at)), quiet),
      onSnapshot(sub(aid, 'payees'), (snap) =>
        setPayees(Object.fromEntries(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() } as T.Payee]))), quiet),
      onSnapshot(subDoc(aid, 'settlements', 'current'), (snap) => setSettlement(snap.exists() ? (snap.data() as T.SettlementMeta) : null), quiet),
      onSnapshot(sub(aid, 'payments'), (snap) =>
        setPayments(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T.Payment).sort((a, b) => a.round - b.round || a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1))), quiet),
      onSnapshot(sub(aid, 'requests'), (snap) =>
        setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T.JoinRequest).sort((a, b) => a.at - b.at)), quiet),
    ];
    return () => stops.forEach((stop) => stop());
  }, [aid, uid]);

  return {
    loading,
    denied,
    activity,
    members,
    expenses: allExpenses.filter((e) => !e.deletedAt),
    deleted: allExpenses.filter((e) => e.deletedAt),
    history,
    payees,
    settlement,
    payments,
    requests,
    pendingWrites,
  };
}

/** Legt eine Aktivität an. Braucht Netz, weil der Server die Mitgliedschaft bestätigen muss. */
export async function createActivity(
  uid: string,
  input: { title: string; topic: string; myName: string; others: string[]; duration: string; endsAt: number | null; settings: T.Settings },
): Promise<string> {
  const aid = newId();
  const token = newToken();
  const now = Date.now();
  await setDoc(act(aid), {
    title: input.title,
    topic: input.topic,
    createdBy: uid,
    createdAt: now,
    startsAt: now,
    endsAt: input.endsAt,
    duration: input.duration,
    status: 'open',
    settings: input.settings,
    token,
    memberUids: [uid],
  });
  await setDoc(subDoc(aid, 'invites', token), { title: input.title, createdAt: now });
  await setDoc(subDoc(aid, 'members', uid), { name: input.myName, uid, color: 0, role: 'organizer', createdAt: now });
  await Promise.all(
    input.others.map((name, i) =>
      setDoc(subDoc(aid, 'members', newId()), { name, uid: null, color: (i + 1) % 8, role: 'member', createdAt: now + i + 1 }),
    ),
  );
  await setDoc(doc(db, 'users', uid, 'activities', aid), {
    title: input.title,
    topic: input.topic,
    startsAt: now,
    joinedAt: now,
    status: 'open',
    token,
    names: [input.myName, ...input.others],
  });
  localStorage.setItem('fair.name', input.myName);
  return aid;
}

/** Hält die persönliche Archiv-Kopie aktuell (Titel, Anlass, Status, Namen für die Suche). */
export function syncMyCopy(uid: string, a: T.Activity, names: string[], status: T.MyActivity['status']) {
  later(
    setDoc(
      doc(db, 'users', uid, 'activities', a.id),
      { title: a.title, topic: a.topic ?? '', startsAt: a.startsAt, status, token: a.token, names },
      { merge: true },
    ),
  );
}

export async function readInvite(aid: string, token: string): Promise<{ title: string } | null> {
  const snap = await getDoc(subDoc(aid, 'invites', token));
  return snap.exists() ? (snap.data() as { title: string }) : null;
}

export async function isMemberOf(aid: string): Promise<boolean> {
  try {
    return (await getDoc(act(aid))).exists();
  } catch {
    return false;
  }
}

export function useMyRequest(aid: string, uid: string | null): T.JoinRequest | null | undefined {
  const [req, setReq] = useState<T.JoinRequest | null | undefined>(undefined);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      subDoc(aid, 'requests', uid),
      (snap) => setReq(snap.exists() ? ({ id: snap.id, ...snap.data() } as T.JoinRequest) : null),
      () => setReq(null),
    );
  }, [aid, uid]);
  return req;
}

export async function requestJoin(uid: string, aid: string, token: string, name: string, title: string) {
  await setDoc(subDoc(aid, 'requests', uid), {
    kind: 'join',
    uid,
    name,
    token,
    at: Date.now(),
    approvals: [],
    status: 'pending',
    rejectedBy: null,
    requestedBy: uid,
  });
  localStorage.setItem('fair.name', name);
  await setDoc(doc(db, 'users', uid, 'activities', aid), {
    title,
    topic: '',
    startsAt: Date.now(),
    joinedAt: Date.now(),
    status: 'pending',
    token,
    names: [],
  });
}

/** Nach Zustimmung aller trägt sich die neue Person selbst als Mitglied ein. */
export async function completeJoin(uid: string, aid: string) {
  const ref = act(aid);
  const snap = await getDoc(ref).catch(() => null);
  if (snap?.exists()) return;
  // Die Regel prüft: nur sich selbst anhängen, und nur mit genehmigter Anfrage.
  await updateDoc(ref, { memberUids: arrayUnion(uid) });
}

function addMemberDoc(aid: string, id: string, name: string, uid: string | null, color: number) {
  later(setDoc(subDoc(aid, 'members', id), { name, uid, color: color % 8, role: 'member', createdAt: Date.now() }));
}

/** Eine Person ohne eigene App hinzufügen. Ab zwei App-Nutzern müssen alle zustimmen. */
export function requestName(aid: string, uid: string, name: string, memberUids: string[], count: number) {
  if (memberUids.length <= 1) return addMemberDoc(aid, newId(), name, null, count);
  const id = newId();
  const approved = memberUids.every((u) => u === uid);
  later(
    setDoc(subDoc(aid, 'requests', id), {
      kind: 'name',
      uid: null,
      name,
      token: null,
      at: Date.now(),
      approvals: [uid],
      status: approved ? 'approved' : 'pending',
      rejectedBy: null,
      requestedBy: uid,
    }),
  );
}

export function approveRequest(aid: string, req: T.JoinRequest, uid: string, memberUids: string[], memberCount: number) {
  if (req.approvals.includes(uid)) return;
  const approvals = [...req.approvals, uid];
  const complete = memberUids.every((u) => approvals.includes(u));
  later(updateDoc(subDoc(aid, 'requests', req.id), { approvals, status: complete ? 'approved' : 'pending' }));
  if (complete && req.kind === 'name') addMemberDoc(aid, req.id, req.name, null, memberCount);
}

export function rejectRequest(aid: string, req: T.JoinRequest, uid: string) {
  later(updateDoc(subDoc(aid, 'requests', req.id), { status: 'rejected', rejectedBy: uid }));
}

/** Nach dem Beitritt: einen vorhandenen Namen übernehmen oder sich neu eintragen. */
export function claimMember(aid: string, memberId: string, uid: string) {
  later(updateDoc(subDoc(aid, 'members', memberId), { uid }));
}
export function addSelf(aid: string, uid: string, name: string, count: number) {
  addMemberDoc(aid, uid, name, uid, count);
}

function log(aid: string, entry: Omit<T.HistoryEntry, 'id' | 'at'>) {
  later(setDoc(subDoc(aid, 'history', newId()), { ...entry, at: Date.now() }));
}

export function saveExpense(
  aid: string,
  uid: string,
  byName: string,
  input: Pick<T.Expense, 'amountCents' | 'label' | 'payerId' | 'participants' | 'isTreat' | 'source'>,
  existing: T.Expense | null,
  summary: string,
  reason: string | null,
) {
  const now = Date.now();
  if (existing) {
    const version = existing.version + 1;
    later(
      updateDoc(subDoc(aid, 'expenses', existing.id), {
        ...input,
        source: existing.source,
        updatedAt: now,
        version,
        ...(reason ? { reason, reasonVersion: version } : {}),
      }),
    );
    log(aid, { expenseId: existing.id, action: 'update', byName, summary, reason });
    return;
  }
  const id = newId();
  later(
    setDoc(subDoc(aid, 'expenses', id), {
      ...input,
      spentAt: now,
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
      version: 1,
      deletedAt: null,
      ...(reason ? { reason, reasonVersion: 1 } : {}),
    }),
  );
  log(aid, { expenseId: id, action: 'create', byName, summary, reason });
}

export function setExpenseDeleted(aid: string, expense: T.Expense, deleted: boolean, byName: string, summary: string, reason: string | null) {
  const version = expense.version + 1;
  later(
    updateDoc(subDoc(aid, 'expenses', expense.id), {
      deletedAt: deleted ? Date.now() : null,
      updatedAt: Date.now(),
      version,
      ...(reason ? { reason, reasonVersion: version } : {}),
    }),
  );
  log(aid, { expenseId: expense.id, action: deleted ? 'delete' : 'restore', byName, summary, reason });
}

export function updateActivity(aid: string, patch: Partial<Pick<T.Activity, 'settings' | 'topic' | 'status'>>) {
  later(updateDoc(act(aid), patch));
}

export function savePayee(aid: string, memberId: string, payee: Omit<T.Payee, 'id'>) {
  later(setDoc(subDoc(aid, 'payees', memberId), payee));
  localStorage.setItem('fair.payee', JSON.stringify(payee));
}

export function rememberedPayee(): Omit<T.Payee, 'id'> | null {
  try {
    return JSON.parse(localStorage.getItem('fair.payee') ?? 'null');
  } catch {
    return null;
  }
}

function paymentDoc(p: SettlementOut['payments'][number], round: number, days: number) {
  return {
    round,
    from: p.from,
    to: p.to,
    amountCents: p.amountCents,
    exactCents: p.exactCents,
    status: 'open',
    method: null,
    sentAt: null,
    receivedAt: null,
    closedAt: null,
    closedBy: null,
    closedReason: null,
    createdAt: Date.now(),
    dueAt: Date.now() + days * 86400000,
  };
}

function metaDoc(uid: string, result: SettlementOut, round: number, reminderDays: number, confirmedAt: number): T.SettlementMeta {
  return {
    confirmedAt,
    confirmedBy: uid,
    updatedAt: Date.now(),
    round,
    inputHash: result.inputHash,
    stepCents: result.stepCents,
    toleranceCents: result.toleranceCents,
    totalCents: result.totalCents,
    balances: result.balances,
    advantage: result.advantage,
    dueAt: Date.now() + reminderDays * 86400000,
  };
}

/** „Passt für uns“: Kassensturz festhalten und die Zahlungen anlegen. */
export function confirmSettlement(aid: string, uid: string, result: SettlementOut, reminderDays: number) {
  const batch = writeBatch(db);
  batch.set(subDoc(aid, 'settlements', 'current'), metaDoc(uid, result, 1, reminderDays, Date.now()));
  for (const p of result.payments) batch.set(subDoc(aid, 'payments', newId()), paymentDoc(p, 1, reminderDays));
  batch.update(act(aid), { status: result.payments.length ? 'settled' : 'done' });
  later(batch.commit());
}

/** Nachausgleich: offene Zahlungen werden ersetzt, erledigte und gemeldete bleiben unangetastet. */
export function recalcSettlement(aid: string, uid: string, meta: T.SettlementMeta, payments: T.Payment[], result: SettlementOut, reminderDays: number) {
  const round = meta.round + 1;
  const batch = writeBatch(db);
  for (const p of payments) if (p.status === 'open') batch.delete(subDoc(aid, 'payments', p.id));
  for (const p of result.payments) batch.set(subDoc(aid, 'payments', newId()), paymentDoc(p, round, reminderDays));
  batch.set(subDoc(aid, 'settlements', 'current'), metaDoc(uid, result, round, reminderDays, meta.confirmedAt));
  batch.update(act(aid), { status: 'settled' });
  later(batch.commit());
}

export function setPaymentStatus(aid: string, p: T.Payment, status: T.Payment['status'], extra: Partial<T.Payment> = {}) {
  const now = Date.now();
  const patch: Partial<T.Payment> = { status, ...extra };
  if (status === 'sent') patch.sentAt = now;
  if (status === 'open') {
    patch.sentAt = null;
    patch.method = null;
  }
  if (status === 'received') patch.receivedAt = now;
  if (status === 'closed') patch.closedAt = now;
  later(updateDoc(subDoc(aid, 'payments', p.id), patch));
}

export function forgetActivity(uid: string, aid: string) {
  later(setDoc(doc(db, 'users', uid, 'activities', aid), { hidden: true }, { merge: true }));
}

export const isDemo = false;
export function demoActAs(_aid: string, _memberId: string) {}

// Typen erneut ausgeben, damit Bildschirme nur aus „store“ importieren
export type { Mode, Share };
