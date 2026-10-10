import { useEffect, useMemo, useState } from 'react';
import { euro, parseAmount } from '../core/pay';
import { settle, SettlementOut } from '../core/settle';
import { remindersFor, shouldPopup, unseen } from '../reminders';
import { buildSuggestions, personalLabels, rememberLabel } from '../suggestions';
import {
  Activity,
  ActivityData,
  addSelf,
  approveRequest,
  claimMember,
  demoActAs,
  EDIT_WINDOW_MS,
  Expense,
  isDemo,
  JoinRequest,
  Member,
  rejectRequest,
  requestName,
  saveExpense,
  setExpenseDeleted,
  syncMyCopy,
  updateActivity,
  useActivity,
  useOnline,
} from '../store';
import { Avatar, Backdrop, Brand, Chip, CountUp, FAIR_TEXT, go, Header, PlusIcon, inviteLink, MODES, modeName, Qr, roundingText, share, Sheet, time } from '../ui';
import { Report } from './Report';
import { Settle } from './Settle';
import { ReminderPopup } from './Start';


export interface Ctx {
  uid: string;
  aid: string;
  data: ActivityData;
  activity: Activity;
  me: Member;
  result: SettlementOut;
  byId: Record<string, Member>;
  /** Kassensturz bestätigt, aber seitdem wurden Ausgaben korrigiert */
  changed: boolean;
}

export function settledTransfers(data: ActivityData) {
  return data.payments.filter((p) => p.status !== 'open').map((p) => ({ from: p.from, to: p.to, amountCents: p.amountCents }));
}

export function ActivityScreen({ uid, aid, view }: { uid: string; aid: string; view: string }) {
  const data = useActivity(aid, uid);
  const { activity, members, expenses } = data;
  const settings = activity?.settings ?? { mode: 'relaxed' as const, roundingStepCents: null, toleranceCents: null };
  const memberIds = members.map((m) => m.id);
  const plain = useMemo(() => settle(aid, memberIds, expenses, settings), [aid, members, expenses, activity]); // eslint-disable-line react-hooks/exhaustive-deps
  const transfers = settledTransfers(data);
  // Nach dem Kassensturz: bereits gezahlte Beträge bleiben, nur die Differenz wird neu verteilt
  const result = useMemo(
    () => (data.settlement ? settle(aid, memberIds, expenses, settings, transfers) : plain),
    [plain, data.settlement, data.payments], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const changed = data.settlement != null && data.settlement.inputHash !== plain.inputHash;
  const me = members.find((m) => m.uid === uid);

  // Archiv-Kopie und Status „erledigt“ aktuell halten
  const finished =
    activity?.status !== 'open' && !changed && data.payments.length > 0 && data.payments.every((p) => p.status === 'received' || p.status === 'closed');
  useEffect(() => {
    if (!activity || !me) return;
    if (activity.status === 'settled' && finished) updateActivity(aid, { status: 'done' });
    if (activity.status === 'done' && changed) updateActivity(aid, { status: 'settled' });
    syncMyCopy(uid, activity, members.map((m) => m.name), activity.status);
  }, [activity, me, finished, changed, members, aid, uid]);

  if (data.denied)
    return (
      <main>
        <Header title="Kein Zugriff" back={''} />
        <p className="card">
          Diese Aktivität sehen nur ihre Mitglieder. Wenn du dabei sein möchtest, öffne den Einladungslink und frage den Beitritt an.
        </p>
      </main>
    );
  if (data.loading || !activity)
    return (
      <main>
        <Header title="" back={''} />
        <p className="muted center">{data.loading ? 'Lädt …' : 'Diese Aktivität gibt es nicht (mehr).'}</p>
      </main>
    );
  if (!me) return <WhoAreYou uid={uid} aid={aid} title={activity.title} members={members} />;

  const byId = Object.fromEntries(members.map((m) => [m.id, m]));
  const ctx: Ctx = { uid, aid, data, activity, me, result, byId, changed };
  const page =
    view === 'details' ? <Details {...ctx} /> : view === 'info' ? <Info {...ctx} /> : view === 'settle' ? <Settle {...ctx} /> : view === 'report' ? <Report {...ctx} /> : <Main {...ctx} />;
  if (!isDemo || view === 'report') return page;
  return (
    <>
      <div className="demo-bar" role="group" aria-label="Demo: Ansicht als">
        <span>Demo · Ansicht als:</span>
        {members.map((m) => (
          <button key={m.id} className={m.id === me.id ? 'on' : ''} aria-pressed={m.id === me.id} onClick={() => demoActAs(aid, m.id)}>
            {m.name}
          </button>
        ))}
      </div>
      {page}
    </>
  );
}

/** Nach genehmigtem Beitritt: freien Namen übernehmen oder sich neu eintragen. */
function WhoAreYou({ uid, aid, title, members }: { uid: string; aid: string; title: string; members: Member[] }) {
  const [name, setName] = useState(localStorage.getItem('fair.name') ?? '');
  const free = members.filter((m) => !m.uid);
  return (
    <main>
      <Header title={title} back={''} />
      <h2>Willkommen! Wer bist du?</h2>
      {free.length > 0 ? (
        <>
          <p className="muted">Wenn die Gruppe dich schon eingetragen hat, tippe deinen Namen an.</p>
          <div className="tiles">
            {free.map((m) => (
              <button
                key={m.id}
                className="tile person"
                onClick={() => {
                  localStorage.setItem('fair.name', m.name);
                  claimMember(aid, m.id, uid);
                }}
              >
                <Avatar member={m} /> {m.name}
              </button>
            ))}
          </div>
          <h3>Mein Name fehlt</h3>
        </>
      ) : null}
      <div className="inline">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dein Name" maxLength={30} />
        <button
          className="btn primary"
          disabled={!name.trim()}
          onClick={() => {
            localStorage.setItem('fair.name', name.trim());
            addSelf(aid, uid, name.trim().slice(0, 30), members.length);
          }}
        >
          Dabei
        </button>
      </div>
    </main>
  );
}

function RequestCard({ ctx, req }: { ctx: Ctx; req: JoinRequest }) {
  const { activity, uid, aid, data } = ctx;
  const mine = req.approvals.includes(uid);
  const needed = activity.memberUids.length;
  const got = req.approvals.filter((u) => activity.memberUids.includes(u)).length;
  return (
    <div className="card request">
      <p>
        <strong>{req.name}</strong> {req.kind === 'join' ? 'möchte dabei sein.' : 'soll als weitere Person (ohne App) dazukommen.'}
      </p>
      <small>
        {got} von {needed} Zustimmungen. Alle, die die App nutzen, müssen zustimmen.
      </small>
      {mine ? (
        <small>Du hast schon zugestimmt.</small>
      ) : (
        <div className="bar">
          <button className="btn" onClick={() => rejectRequest(aid, req, uid)}>
            Ablehnen
          </button>
          <button className="btn primary grow" onClick={() => approveRequest(aid, req, uid, activity.memberUids, data.members.length)}>
            Zustimmen
          </button>
        </div>
      )}
    </div>
  );
}

function Main(ctx: Ctx) {
  const { activity, data, result, aid, uid, me } = ctx;
  const online = useOnline();
  const [sheet, setSheet] = useState<null | 'new' | 'all'>(null);
  const [standing, setStanding] = useState(false);
  const [toast, setToast] = useState('');
  const settled = activity.status !== 'open';
  const step = Math.max(result.stepCents, 100);
  const pending = data.requests.filter((r) => r.status === 'pending');
  const reminders = unseen(remindersFor({ aid, title: activity.title, uid, myMemberId: me.id, members: data.members, payments: data.payments, requests: data.requests }));
  const [popup, setPopup] = useState(false);
  useEffect(() => {
    if (reminders.length > 0 && shouldPopup(`a:${aid}`)) setPopup(true);
  }, [reminders.length, aid]);
  const doneCount = data.payments.filter((p) => p.status === 'received' || p.status === 'closed').length;

  return (
    <main className="with-dock">
      <Backdrop />
      <Header
        title={<Brand small />}
        back={''}
        right={
          <button className="icon-btn" onClick={() => go(`/a/${aid}/info`)} aria-label="So rechnen wir, Einladen">
            i
          </button>
        }
      />
      {!online ? <p className="banner">Kein Netz. Du kannst weiter erfassen, es wird später übertragen.</p> : null}
      {online && data.pendingWrites ? <p className="banner soft">Wird übertragen …</p> : null}
      {pending.map((r) => (
        <RequestCard key={r.id} ctx={ctx} req={r} />
      ))}
      {settled ? (
        <button className="card settled-strip" onClick={() => go(`/a/${aid}/settle`)}>
          {ctx.changed
            ? 'Nach dem Kassensturz wurde etwas korrigiert. Nachausgleich ansehen ›'
            : activity.status === 'done'
              ? 'Alles ausgeglichen. ›'
              : `Kassensturz gemacht · ${doneCount} von ${data.payments.length} Zahlungen erledigt ›`}
        </button>
      ) : null}
      <div className="card hero-card pop">
        <small className="hero-title">
          {activity.title}
          {activity.topic ? ` · ${activity.topic}` : ''}
        </small>
        <strong className="hero-total">
          <CountUp cents={result.totalCents} />
        </strong>
        <small>gemeinsam ausgegeben</small>
        <div className="avatar-row" aria-label={`${data.members.length} Personen`}>
          {data.members.map((m) => (
            <Avatar key={m.id} member={m} size={34} />
          ))}
        </div>
      </div>
      <h3 className="section">Bisher übernommen</h3>
      <div className="tiles-2">
        {data.members.map((m, i) => {
          const paid = result.paid[m.id] ?? 0;
          return (
            <div className="card tile-person pop" key={m.id} style={{ animationDelay: `${0.15 + i * 0.05}s` }}>
              <div className="tile-head">
                <Avatar member={m} size={28} />
                <span className="tile-name">{m.name}</span>
                {m.id === me.id ? <span className="you">du</span> : null}
              </div>
              <div className={`tile-amount ${paid === 0 ? 'zero' : ''}`}>{euro(paid)}</div>
              {standing && !settled ? <small>{standingText(result.balances[m.id] ?? 0, step, result.toleranceCents)}</small> : null}
            </div>
          );
        })}
      </div>
      <div className="links">
        {!settled ? (
          <button className="link" onClick={() => setStanding(!standing)}>
            {standing ? 'Zwischenstand ausblenden' : 'Zwischenstand ansehen'}
          </button>
        ) : (
          <span />
        )}
        <button className="link" onClick={() => go(`/a/${aid}/details`)}>
          Details anzeigen
        </button>
      </div>
      {!settled ? (
        <button className="btn wide" onClick={() => go(`/a/${aid}/settle`)}>
          Kassensturz
        </button>
      ) : null}
      {toast ? <p className="toast">{toast}</p> : null}
      <div className="dock">
        <button className="btn primary grow big" onClick={() => setSheet('new')}>
          <PlusIcon /> Ausgabe
        </button>
        {!settled ? (
          <button className="btn coral big" onClick={() => setSheet('all')}>
            Für alle
          </button>
        ) : null}
      </div>
      {sheet ? (
        <ExpenseSheet
          ctx={ctx}
          existing={null}
          quick={sheet === 'all'}
          onClose={(message) => {
            setSheet(null);
            if (message) {
              setToast(message);
              setTimeout(() => setToast(''), 3000);
            }
          }}
        />
      ) : null}
      {popup ? <ReminderPopup items={reminders} onClose={() => setPopup(false)} /> : null}
    </main>
  );
}

function standingText(balance: number, step: number, tolerance: number): string {
  if (Math.abs(balance) < Math.max(tolerance, step / 2)) return 'ungefähr ausgeglichen';
  const rounded = Math.round(Math.abs(balance) / step) * step;
  return balance > 0 ? `liegt etwa ${euro(rounded)} vorn` : `gibt am Ende etwa ${euro(rounded)} dazu`;
}

function expenseSummary(e: { label: string; amountCents: number }, payer: string) {
  return `${e.label}, ${euro(e.amountCents, true)}, bezahlt von ${payer}`.slice(0, 200);
}

/** Braucht diese Änderung eine Begründung? (nach dem Kassensturz oder später als 12 Stunden nach dem Eintragen) */
export function needsReason(activity: Activity, existing: Expense | null): boolean {
  if (activity.status !== 'open') return true;
  return existing != null && Date.now() - existing.createdAt > EDIT_WINDOW_MS;
}

export function ExpenseSheet(props: { ctx: Ctx; existing: Expense | null; quick: boolean; onClose: (message?: string) => void }) {
  const { ctx, existing } = props;
  const { data, activity, me, aid, uid, byId } = ctx;
  const weighted = activity.settings.mode !== 'relaxed';
  const everyone = () => Object.fromEntries(data.members.map((m) => [m.id, 1]));
  const [amount, setAmount] = useState(existing ? (existing.amountCents / 100).toFixed(2).replace('.', ',').replace(',00', '') : '');
  const [label, setLabel] = useState(existing?.label ?? '');
  const [payer, setPayer] = useState(existing?.payerId ?? me.id);
  const [weights, setWeights] = useState<Record<string, number>>(
    existing ? Object.fromEntries(existing.participants.map((p) => [p.memberId, p.weight])) : everyone(),
  );
  const [treat, setTreat] = useState(existing?.isTreat ?? false);
  const [confirmDouble, setConfirmDouble] = useState(false);
  const [reason, setReason] = useState('');
  const reasonNeeded = needsReason(activity, existing);
  const reasonOk = !reasonNeeded || reason.trim().length >= 5;

  const [personal] = useState(personalLabels);
  const suggestions = useMemo(() => {
    const base = {
      activityLabels: [...data.expenses].sort((a, b) => a.spentAt - b.spentAt).map((e) => e.label),
      context: `${activity.title} ${activity.topic ?? ''}`,
      personal,
    };
    const all = buildSuggestions(base);
    // Ein angetippter Vorschlag soll die Liste nicht wegfiltern
    if (!label.trim() || all.some((s) => s.toLowerCase() === label.trim().toLowerCase())) return all;
    return buildSuggestions({ ...base, typed: label });
  }, [data.expenses, activity.title, activity.topic, personal, label]);
  const cents = parseAmount(amount);
  const selected = data.members.filter((m) => (weights[m.id] ?? 0) > 0);
  const allOn = selected.length === data.members.length && selected.every((m) => weights[m.id] === 1);
  const valid = cents != null && label.trim().length > 0 && (treat || selected.length > 0) && reasonOk;
  const tap = (id: string) => {
    const w = weights[id] ?? 0;
    const next = weighted ? (w === 0 ? 1 : w === 1 ? 2 : w === 2 ? 0.5 : 0) : w > 0 ? 0 : 1;
    setWeights({ ...weights, [id]: next });
  };
  const weightMark = (w: number) => (w === 2 ? ' ×2' : w === 0.5 ? ' ½' : '');
  const why = reasonNeeded ? reason.trim().slice(0, 300) : null;

  const save = () => {
    if (!valid || cents == null) return;
    const clean = label.trim().slice(0, 60);
    const twin =
      !existing &&
      data.expenses.find((e) => e.amountCents === cents && e.label.toLowerCase() === clean.toLowerCase() && Date.now() - e.spentAt < 600000);
    if (twin && !confirmDouble) return setConfirmDouble(true);
    const input = {
      amountCents: cents,
      label: clean,
      payerId: payer,
      participants: selected.map((m) => ({ memberId: m.id, weight: weights[m.id] })),
      isTreat: treat,
      source: (allOn && props.quick ? 'quick_all' : 'manual') as Expense['source'],
    };
    saveExpense(aid, uid, me.name, input, existing, expenseSummary(input, byId[payer]?.name ?? '?'), why);
    if (!existing) rememberLabel(clean);
    const who = payer === me.id ? 'Du hast' : `${byId[payer]?.name} hat`;
    props.onClose(existing ? 'Gespeichert.' : `${who} ${euro(cents)} für ${clean} übernommen`);
  };

  return (
    <Sheet title={existing ? 'Ausgabe ändern' : props.quick ? 'Für alle' : 'Neue Ausgabe'} onClose={() => props.onClose()}>
      {reasonNeeded ? (
        <p className="warn">
          {activity.status !== 'open'
            ? 'Der Kassensturz ist schon gemacht. Änderungen sind möglich, brauchen aber eine kurze Begründung und werden für alle sichtbar festgehalten. Bereits erledigte Zahlungen bleiben bestehen; die Differenz wird als Nachausgleich verrechnet.'
            : 'Diese Ausgabe ist älter als 12 Stunden. Änderungen brauchen jetzt eine kurze Begründung, die alle sehen.'}
        </p>
      ) : null}
      <div className="amount-field">
        <input
          inputMode="decimal"
          autoFocus={!existing}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          aria-label="Betrag in Euro"
        />
        <span>€</span>
      </div>
      <input className="label-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Wofür?" maxLength={60} aria-label="Wofür" />
      <div className="chips compact">
        {suggestions.map((s) => (
          <Chip key={s} on={label.trim().toLowerCase() === s.toLowerCase()} onClick={() => setLabel(s)}>
            {s}
          </Chip>
        ))}
      </div>
      <h3>Bezahlt von</h3>
      <div className="chips">
        {data.members.map((m) => (
          <Chip key={m.id} on={payer === m.id} onClick={() => setPayer(m.id)}>
            {m.id === me.id ? 'Ich' : m.name}
          </Chip>
        ))}
      </div>
      {!treat ? (
        <>
          <h3>Für</h3>
          <div className="chips">
            <Chip on={allOn} onClick={() => setWeights(allOn ? {} : everyone())}>
              alle
            </Chip>
            {data.members.map((m) => (
              <Chip key={m.id} on={(weights[m.id] ?? 0) > 0} onClick={() => tap(m.id)}>
                {m.name}
                {weightMark(weights[m.id] ?? 0)}
              </Chip>
            ))}
          </div>
          {weighted ? <p className="muted">Mehrmals antippen: normal → doppelter Anteil → halber Anteil → nicht dabei.</p> : null}
        </>
      ) : null}
      <label className="switch">
        <input type="checkbox" checked={treat} onChange={(e) => setTreat(e.target.checked)} />
        <span>Geht auf {payer === me.id ? 'mich' : byId[payer]?.name} (wird nicht aufgeteilt)</span>
      </label>
      {reasonNeeded ? (
        <label className="field">
          <span>Begründung (Pflicht, mindestens 5 Zeichen)</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={2} placeholder="z. B. Betrag war falsch eingetippt" />
        </label>
      ) : null}
      {confirmDouble ? <p className="warn">Das sieht aus wie eine Ausgabe von eben. Schon eingetragen? Tippe noch einmal, um sie trotzdem zu speichern.</p> : null}
      <div className="bar">
        {existing ? (
          <button
            className="btn danger"
            disabled={!reasonOk}
            onClick={() => {
              setExpenseDeleted(aid, existing, true, me.name, expenseSummary(existing, byId[existing.payerId]?.name ?? '?'), why);
              props.onClose('Gelöscht. Wiederherstellen geht unter „Details“.');
            }}
          >
            Löschen
          </button>
        ) : null}
        <button className="btn primary grow big" disabled={!valid} onClick={save}>
          {confirmDouble ? 'Trotzdem speichern' : 'Speichern'}
        </button>
      </div>
      {existing ? <History ctx={ctx} expenseId={existing.id} /> : null}
    </Sheet>
  );
}

const ACTION = { create: 'angelegt', update: 'geändert', delete: 'gelöscht', restore: 'wiederhergestellt' };

function History({ ctx, expenseId }: { ctx: Ctx; expenseId: string }) {
  const entries = ctx.data.history.filter((h) => h.expenseId === expenseId);
  return (
    <div className="history">
      <h3>Verlauf</h3>
      {entries.map((h) => (
        <p key={h.id}>
          <small>
            {time(h.at)} · {h.byName} · {ACTION[h.action]}
          </small>
          {h.summary}
          {h.reason ? <em className="reason">Begründung: {h.reason}</em> : null}
        </p>
      ))}
    </div>
  );
}

function Details(ctx: Ctx) {
  const { data, aid, byId, me, activity } = ctx;
  const [edit, setEdit] = useState<Expense | null>(null);
  const [restore, setRestore] = useState<Expense | null>(null);
  const [reason, setReason] = useState('');
  const corrected = (e: Expense) => data.history.some((h) => h.expenseId === e.id && h.reason);
  const forWhom = (e: Expense) => {
    if (e.isTreat) return 'übernommen';
    const ids = e.participants.map((p) => p.memberId).filter((id) => byId[id]);
    if (ids.length === data.members.length) return 'für alle';
    return 'für ' + ids.map((id) => byId[id].name).join(', ');
  };
  return (
    <main>
      <Header
        title="Details"
        back={`/a/${aid}`}
        right={
          <button className="icon-btn" onClick={() => go(`/a/${aid}/report`)} aria-label="Drucken oder als PDF speichern">
            ⎙
          </button>
        }
      />
      {data.expenses.length === 0 ? <p className="muted center">Noch keine Ausgaben.</p> : null}
      {data.expenses.map((e) => (
        <button className="card row" key={e.id} onClick={() => setEdit(e)}>
          <Avatar member={byId[e.payerId]} size={36} />
          <span className="grow">
            <strong>
              {e.label}
              {corrected(e) ? <span className="tag">korrigiert</span> : null}
            </strong>
            <small>
              {byId[e.payerId]?.name ?? '?'} · {forWhom(e)} · {time(e.spentAt)}
            </small>
          </span>
          <span className="amount">{euro(e.amountCents, true)}</span>
        </button>
      ))}
      {data.deleted.length > 0 ? <h3>Gelöscht</h3> : null}
      {data.deleted.map((e) => (
        <div className="card row faded" key={e.id}>
          <span className="grow">
            <strong>{e.label}</strong>
            <small>
              {byId[e.payerId]?.name ?? '?'} · {euro(e.amountCents, true)}
            </small>
          </span>
          <button
            className="btn"
            onClick={() =>
              needsReason(activity, e) ? setRestore(e) : setExpenseDeleted(aid, e, false, me.name, `${e.label}, ${euro(e.amountCents, true)}`, null)
            }
          >
            Wiederherstellen
          </button>
        </div>
      ))}
      <button className="btn wide" onClick={() => go(`/a/${aid}/report`)}>
        Drucken oder als PDF speichern
      </button>
      {edit ? <ExpenseSheet ctx={ctx} existing={edit} quick={false} onClose={() => setEdit(null)} /> : null}
      {restore ? (
        <Sheet title="Wiederherstellen" onClose={() => setRestore(null)}>
          <p>Bitte kurz begründen, warum „{restore.label}“ wieder zählen soll.</p>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={2} />
          <button
            className="btn primary wide"
            disabled={reason.trim().length < 5}
            onClick={() => {
              setExpenseDeleted(aid, restore, false, me.name, `${restore.label}, ${euro(restore.amountCents, true)}`, reason.trim());
              setRestore(null);
              setReason('');
            }}
          >
            Wiederherstellen
          </button>
        </Sheet>
      ) : null}
    </main>
  );
}

function Info(ctx: Ctx) {
  const { activity, aid, data, uid, me } = ctx;
  const [note, setNote] = useState('');
  const [name, setName] = useState('');
  const [topic, setTopic] = useState(activity.topic ?? '');
  const link = inviteLink(aid, activity.token);
  const owner = activity.createdBy === uid;
  const s = activity.settings;
  const days = s.reminderDays ?? 3;
  const open = activity.status === 'open';
  return (
    <main>
      <Header title="So rechnen wir" back={`/a/${aid}`} />
      <div className="card summary">
        <p>
          <strong>{activity.title}</strong>
        </p>
        {activity.topic ? <p>Anlass: {activity.topic}</p> : null}
        <p>{data.members.length} Personen</p>
        <p>Modus: {modeName(s.mode)}</p>
        <p>{roundingText(s.roundingStepCents, s.toleranceCents)}</p>
        <p>Zahlen und Bestätigen innerhalb von {days} {days === 1 ? 'Tag' : 'Tagen'} nach dem Kassensturz</p>
        <p>Ausgaben lassen sich 12 Stunden lang frei korrigieren, danach nur mit Begründung.</p>
      </div>
      <p className="fair">{FAIR_TEXT}</p>
      {owner ? (
        <>
          <h3>Anlass</h3>
          <div className="inline">
            <input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={60} placeholder="z. B. Schiffsausflug" />
            <button className="btn" disabled={topic.trim() === (activity.topic ?? '')} onClick={() => updateActivity(aid, { topic: topic.trim() })}>
              Speichern
            </button>
          </div>
          <h3>Frist zum Zahlen und Bestätigen</h3>
          <div className="chips">
            {[1, 3, 7, 14].map((d) => (
              <Chip key={d} on={days === d} onClick={() => updateActivity(aid, { settings: { ...s, reminderDays: d } })}>
                {d} {d === 1 ? 'Tag' : 'Tage'}
              </Chip>
            ))}
          </div>
        </>
      ) : null}
      {owner && open ? (
        <>
          <h3>Modus ändern</h3>
          <div className="chips">
            {MODES.map((m) => (
              <Chip
                key={m.id}
                on={s.mode === m.id}
                onClick={() =>
                  updateActivity(aid, {
                    settings: {
                      ...s,
                      mode: m.id,
                      roundingStepCents: m.id === 'exact' ? 1 : s.roundingStepCents === 1 ? null : s.roundingStepCents,
                      toleranceCents: m.id === 'exact' ? 0 : s.roundingStepCents === 1 ? null : s.toleranceCents,
                    },
                  })
                }
              >
                {m.name}
              </Chip>
            ))}
          </div>
          <p className="muted">Alle sehen die Änderung sofort.</p>
        </>
      ) : null}
      <h3>Freunde einladen</h3>
      <Qr text={link} label="QR-Code zum Beitreten" />
      <button
        className="btn primary wide"
        onClick={async () => {
          const r = await share(`Mach mit bei „${activity.title}“ in Ausgleich.app:`, link);
          setNote(r === 'copied' ? 'Link kopiert.' : r === 'failed' ? 'Teilen nicht möglich. Bitte den QR-Code zeigen.' : '');
        }}
      >
        Link teilen
      </button>
      {note ? <p className="muted center">{note}</p> : null}
      <p className="muted">
        Wer den Link öffnet, kann den Beitritt nur anfragen. Dabei ist er erst, wenn alle zugestimmt haben, die die App schon nutzen. Ausgaben von vor dem
        Beitritt werden nicht auf ihn verteilt.
      </p>
      <h3>Person ohne App hinzufügen</h3>
      <div className="inline">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" maxLength={30} />
        <button
          className="btn"
          disabled={!name.trim()}
          onClick={() => {
            requestName(aid, uid, name.trim().slice(0, 30), activity.memberUids, data.members.length);
            setNote(activity.memberUids.length > 1 ? 'Vorschlag gesendet. Die anderen müssen noch zustimmen.' : '');
            setName('');
          }}
        >
          Vorschlagen
        </button>
      </div>
      {isDemo ? (
        <>
          <h3>Demo: Ansicht als …</h3>
          <div className="chips">
            {data.members.map((m) => (
              <Chip key={m.id} on={m.id === me.id} onClick={() => demoActAs(aid, m.id)}>
                {m.name}
              </Chip>
            ))}
          </div>
          <p className="muted">Nur im Demo-Modus: So siehst du, was andere sehen, zum Beispiel beim Bestätigen einer Zahlung.</p>
        </>
      ) : null}
      <button className="btn wide" onClick={() => go(`/a/${aid}/report`)}>
        Drucken oder als PDF speichern
      </button>
      <button className="btn wide" onClick={() => go(`/a/${aid}`)}>
        Zur Aktivität
      </button>
    </main>
  );
}
