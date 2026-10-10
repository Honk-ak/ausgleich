// Prüft die Zugriffsregeln gegen den Firestore-Emulator: npm run test:rules (braucht Java)
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, it } from 'vitest';

let env: RulesTestEnvironment;
const A = 'act1';
const TOKEN = 'geheimes-token';
const now = Date.now();
const activity = { title: 'Samstag', topic: '', createdBy: 'anna', status: 'open', settings: { mode: 'relaxed' }, token: TOKEN, memberUids: ['anna'], createdAt: now };
const expense = (extra = {}) => ({ amountCents: 2400, label: 'Eis', payerId: 'anna', participants: [], isTreat: false, deletedAt: null, createdBy: 'anna', createdAt: now, spentAt: now, version: 1, ...extra });
const db = (uid: string | null) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();
const d = (uid: string | null, ...path: string[]) => doc(db(uid), 'activities', A, ...path);

async function join(uid: string, approvers: string[]) {
  await assertSucceeds(setDoc(d(uid, 'requests', uid), { kind: 'join', uid, name: uid, token: TOKEN, at: now, approvals: [], status: 'pending', rejectedBy: null, requestedBy: uid }));
  const all: string[] = [];
  for (const [i, a] of approvers.entries()) {
    all.push(a);
    await assertSucceeds(updateDoc(d(a, 'requests', uid), { approvals: [...all], status: i === approvers.length - 1 ? 'approved' : 'pending' }));
  }
  await assertSucceeds(updateDoc(doc(db(uid), 'activities', A), { memberUids: arrayUnion(uid) }));
  await assertSucceeds(setDoc(d(uid, 'members', uid), { name: uid, uid, color: 1, role: 'member', createdAt: now }));
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-fair',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
  // Anna legt an, in derselben Reihenfolge wie die App
  await assertSucceeds(setDoc(doc(db('anna'), 'activities', A), activity));
  await assertSucceeds(setDoc(d('anna', 'invites', TOKEN), { title: 'Samstag', createdAt: now }));
  await assertSucceeds(setDoc(d('anna', 'members', 'anna'), { name: 'Anna', uid: 'anna', color: 0, role: 'organizer', createdAt: now }));
  await assertSucceeds(setDoc(d('anna', 'members', 'm-peter'), { name: 'Peter', uid: null, color: 1, role: 'member', createdAt: now }));
  await assertSucceeds(setDoc(d('anna', 'expenses', 'e1'), expense()));
});
afterAll(() => env.cleanup());

describe('Fremde ohne Zustimmung', () => {
  it('können nichts lesen', async () => {
    await assertFails(getDoc(doc(db('eve'), 'activities', A)));
    await assertFails(getDocs(collection(db('eve'), 'activities')));
    await assertFails(getDocs(collection(db('eve'), 'activities', A, 'expenses')));
    await assertFails(getDoc(d('eve', 'expenses', 'e1')));
    await assertFails(getDocs(collection(db('eve'), 'activities', A, 'members')));
    await assertFails(getDocs(collection(db('eve'), 'activities', A, 'invites')));
    await assertFails(getDocs(collection(db('eve'), 'activities', A, 'requests')));
  });
  it('können sich nicht selbst eintragen, auch nicht mit Token', async () => {
    await assertFails(updateDoc(doc(db('eve'), 'activities', A), { memberUids: arrayUnion('eve') }));
    await assertFails(setDoc(d('eve', 'requests', 'eve'), { kind: 'join', uid: 'eve', name: 'Eve', token: 'falsch', at: now, approvals: [], status: 'pending', rejectedBy: null, requestedBy: 'eve' }));
    // gültige Anfrage, aber sich selbst genehmigen geht nicht
    await assertSucceeds(setDoc(d('eve', 'requests', 'eve'), { kind: 'join', uid: 'eve', name: 'Eve', token: TOKEN, at: now, approvals: [], status: 'pending', rejectedBy: null, requestedBy: 'eve' }));
    await assertFails(updateDoc(d('eve', 'requests', 'eve'), { approvals: ['eve'], status: 'approved' }));
    await assertFails(updateDoc(doc(db('eve'), 'activities', A), { memberUids: arrayUnion('eve') }));
    await assertFails(getDocs(collection(db('eve'), 'activities', A, 'expenses')));
  });
  it('können keine Anfrage mit Fremd-Stimmen anlegen', async () => {
    await assertFails(setDoc(d('mallory', 'requests', 'mallory'), { kind: 'join', uid: 'mallory', name: 'M', token: TOKEN, at: now, approvals: ['anna'], status: 'approved', rejectedBy: null, requestedBy: 'mallory' }));
  });
  it('unangemeldet geht gar nichts', async () => {
    await assertFails(getDoc(doc(db(null), 'activities', A)));
    await assertFails(getDoc(d(null, 'invites', TOKEN)));
  });
});

describe('Beitritt mit Zustimmung aller', () => {
  it('Tom tritt bei, nachdem Anna zugestimmt hat', async () => {
    await join('tom', ['anna']);
    await assertSucceeds(getDocs(collection(db('tom'), 'activities', A, 'expenses')));
  });
  it('Lisa braucht danach die Zustimmung von Anna UND Tom', async () => {
    await assertSucceeds(setDoc(d('lisa', 'requests', 'lisa'), { kind: 'join', uid: 'lisa', name: 'Lisa', token: TOKEN, at: now, approvals: [], status: 'pending', rejectedBy: null, requestedBy: 'lisa' }));
    await assertFails(updateDoc(d('anna', 'requests', 'lisa'), { approvals: ['anna'], status: 'approved' }));
    await assertSucceeds(updateDoc(d('anna', 'requests', 'lisa'), { approvals: ['anna'], status: 'pending' }));
    await assertFails(updateDoc(doc(db('lisa'), 'activities', A), { memberUids: arrayUnion('lisa') }));
    await assertFails(updateDoc(d('anna', 'requests', 'lisa'), { approvals: ['anna', 'anna'], status: 'pending' }));
    await assertSucceeds(updateDoc(d('tom', 'requests', 'lisa'), { approvals: ['anna', 'tom'], status: 'approved' }));
    await assertSucceeds(updateDoc(doc(db('lisa'), 'activities', A), { memberUids: arrayUnion('lisa') }));
  });
  it('ein Name ohne App braucht ebenfalls alle Stimmen', async () => {
    await assertFails(setDoc(d('tom', 'members', 'm-new'), { name: 'Luise', uid: null, color: 2, role: 'member', createdAt: now }));
    await assertSucceeds(setDoc(d('tom', 'requests', 'm-new'), { kind: 'name', uid: null, name: 'Luise', token: null, at: now, approvals: ['tom'], status: 'pending', rejectedBy: null, requestedBy: 'tom' }));
    await assertSucceeds(updateDoc(d('anna', 'requests', 'm-new'), { approvals: ['tom', 'anna'], status: 'pending' }));
    await assertSucceeds(updateDoc(d('lisa', 'requests', 'm-new'), { approvals: ['tom', 'anna', 'lisa'], status: 'approved' }));
    await assertSucceeds(setDoc(d('lisa', 'members', 'm-new'), { name: 'Luise', uid: null, color: 2, role: 'member', createdAt: now }));
  });
  it('freie Namen nur für sich selbst übernehmen, vergebene gar nicht', async () => {
    await assertFails(updateDoc(d('tom', 'members', 'm-peter'), { uid: 'someone-else' }));
    await assertFails(updateDoc(d('tom', 'members', 'anna'), { uid: 'tom' }));
  });
});

describe('Ausgaben', () => {
  it('innerhalb von 12 Stunden frei änderbar', async () => {
    await assertSucceeds(updateDoc(d('tom', 'expenses', 'e1'), { amountCents: 2100, version: 2 }));
  });
  it('ungültige Werte und echtes Löschen sind verboten', async () => {
    await assertFails(setDoc(d('tom', 'expenses', 'bad1'), expense({ amountCents: -5, createdBy: 'tom' })));
    await assertFails(setDoc(d('tom', 'expenses', 'bad2'), expense({ amountCents: 12.5, createdBy: 'tom' })));
    await assertFails(setDoc(d('tom', 'expenses', 'bad3'), expense({ label: '', createdBy: 'tom' })));
    await assertFails(setDoc(d('tom', 'expenses', 'bad4'), expense({ createdBy: 'anna' })));
    await assertFails(deleteDoc(d('tom', 'expenses', 'e1')));
  });
  it('nach 12 Stunden nur mit Begründung', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'activities', A, 'expenses', 'old'), expense({ createdAt: now - 13 * 3600000 }));
    });
    await assertFails(updateDoc(d('tom', 'expenses', 'old'), { amountCents: 2000, version: 2 }));
    await assertSucceeds(updateDoc(d('tom', 'expenses', 'old'), { amountCents: 2000, version: 2, reason: 'Betrag vertippt', reasonVersion: 2 }));
    // alte Begründung zählt nicht für die nächste Änderung
    await assertFails(updateDoc(d('tom', 'expenses', 'old'), { amountCents: 1900, version: 3 }));
  });
});

describe('Zahlungen', () => {
  const pay = { round: 1, from: 'tom', to: 'anna', amountCents: 1400, exactCents: 1400, status: 'open', method: null, sentAt: null, receivedAt: null, closedAt: null, closedBy: null, closedReason: null, createdAt: now, dueAt: now };
  beforeAll(async () => {
    await assertSucceeds(setDoc(d('anna', 'payments', 'p1'), pay));
    await assertSucceeds(setDoc(d('anna', 'payments', 'p2'), pay));
  });
  it('nur der Zahler meldet „überwiesen“', async () => {
    await assertFails(updateDoc(d('lisa', 'payments', 'p1'), { status: 'sent' }));
    await assertFails(updateDoc(d('anna', 'payments', 'p1'), { status: 'sent' }));
    await assertSucceeds(updateDoc(d('tom', 'payments', 'p1'), { status: 'sent', sentAt: now }));
  });
  it('nur der Empfänger bestätigt den Eingang', async () => {
    await assertFails(updateDoc(d('tom', 'payments', 'p1'), { status: 'received' }));
    await assertFails(updateDoc(d('lisa', 'payments', 'p1'), { status: 'received' }));
    await assertSucceeds(updateDoc(d('anna', 'payments', 'p1'), { status: 'received', receivedAt: now }));
  });
  it('erledigte Zahlungen sind unveränderlich', async () => {
    await assertFails(updateDoc(d('anna', 'payments', 'p1'), { status: 'open' }));
    await assertFails(updateDoc(d('anna', 'payments', 'p1'), { amountCents: 1 }));
    await assertFails(deleteDoc(d('anna', 'payments', 'p1')));
  });
  it('ohne Bestätigung abschließen nur mit Begründung', async () => {
    await assertFails(updateDoc(d('tom', 'payments', 'p2'), { status: 'closed', closedBy: 'tom', closedReason: 'kurz' }));
    await assertFails(updateDoc(d('lisa', 'payments', 'p2'), { status: 'closed', closedBy: 'lisa', closedReason: 'Anna antwortet nicht mehr' }));
    await assertSucceeds(updateDoc(d('tom', 'payments', 'p2'), { status: 'closed', closedBy: 'tom', closedReason: 'Anna antwortet seit zwei Wochen nicht' }));
  });
});

describe('Einstellungen und Archiv', () => {
  it('Einstellungen ändert nur der Organisator', async () => {
    await assertFails(updateDoc(doc(db('tom'), 'activities', A), { settings: { mode: 'exact' } }));
    await assertFails(updateDoc(doc(db('tom'), 'activities', A), { createdBy: 'tom' }));
    await assertFails(updateDoc(doc(db('tom'), 'activities', A), { memberUids: ['tom'] }));
    await assertSucceeds(updateDoc(doc(db('anna'), 'activities', A), { settings: { mode: 'balanced' }, topic: 'Schiffsausflug' }));
  });
  it('das persönliche Archiv ist nur für einen selbst', async () => {
    await assertSucceeds(setDoc(doc(db('tom'), 'users', 'tom', 'activities', A), { title: 'Samstag' }));
    await assertFails(getDoc(doc(db('eve'), 'users', 'tom', 'activities', A)));
  });
});
