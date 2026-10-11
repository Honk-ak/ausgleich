import { useEffect, useMemo, useState } from 'react';
import { euro, parseAmount } from '../core/pay';
import { exitPlan, settle, SettlementOut } from '../core/settle';
import { remindersFor, shouldPopup, unseen } from '../reminders';
import { Art, ART_KINDS, artFor } from '../art';
import { buildSuggestions, personalLabels, rememberLabel, themeKey } from '../suggestions';
import {
  Activity,
  ActivityData,
  approveRequest,
  claimMember,
  countedTransfers,
  demoActAs,
  EDIT_WINDOW_MS,
  Expense,
  isActive,
  isDemo,
  isInvolved,
  JoinRequest,
  leaveGroup,
  leaveWithSettlement,
  Member,
  rejectRequest,
  rememberedPayee,
  removeMember,
  renameMember,
  requestName,
  sameName,
  savePayee,
  saveExpense,
  setExpenseDeleted,
  setJoinOpen,
  syncMyCopy,
  updateActivity,
  useActivity,
  useOnline,
} from '../store';
import {
  Avatar,
  Backdrop,
  Brand,
  Chip,
  CountUp,
  dateRange,
  endOfDay,
  FAIR_TEXT,
  fromInputDate,
  go,
  Header,
  PlusIcon,
  inviteLink,
  MODES,
  modeName,
  Qr,
  roundingText,
  share,
  Sheet,
  startOfDay,
  time,
  toInputDate,
} from '../ui';
import { NameStep } from './Onboard';
import { PayeeForm, payeeSummary } from './PayeeForm';
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
  /** Ausgleich vereinbart, aber seitdem wurden Ausgaben korrigiert */
  changed: boolean;
}


export function ActivityScreen({ uid, aid, view }: { uid: string; aid: string; view: string }) {
  const data = useActivity(aid, uid);
  const { activity, members, expenses } = data;
  const settings = activity?.settings ?? { mode: 'relaxed' as const, roundingStepCents: null, toleranceCents: null };
  const memberIds = members.map((m) => m.id);
  // Wer vorzeitig gegangen ist, ist mit dem Teilausgleich fertig abgerechnet
  const frozen = members.filter((m) => m.leftAt).map((m) => m.id);
  const plain = useMemo(
    () => settle(aid, memberIds, expenses, settings, countedTransfers(data.payments, false), frozen),
    [aid, members, expenses, activity, data.payments], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // Nach dem Ausgleich: bereits gezahlte Beträge bleiben, nur die Differenz wird neu verteilt
  const result = useMemo(
    () => (data.settlement ? settle(aid, memberIds, expenses, settings, countedTransfers(data.payments, true), frozen) : plain),
    [plain, data.settlement, data.payments], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const changed = data.settlement != null && data.settlement.inputHash !== plain.inputHash;
  const me = members.find((m) => m.uid === uid && !m.leftAt) ?? members.find((m) => m.uid === uid);

  // Archiv-Kopie und Status „erledigt“ aktuell halten
  const finished =
    activity?.status !== 'open' && !changed && data.payments.length > 0 && data.payments.every((p) => p.status === 'received' || p.status === 'closed');
  useEffect(() => {
    if (!activity || !me) return;
    if (activity.status === 'settled' && finished) updateActivity(aid, { status: 'done', doneAt: Date.now() });
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

/** Mitglied, aber noch ohne Namen in der Liste (z. B. App zwischendurch geschlossen): Namen eintragen. */
function WhoAreYou({ uid, aid, title, members }: { uid: string; aid: string; title: string; members: Member[] }) {
  const free = members.filter((m) => !m.uid && !m.leftAt);
  return (
    <main>
      <Header title={title} back={''} />
      <h2>Willkommen!</h2>
      {free.length > 0 ? (
        <>
          <p className="muted">Hat dich die Gruppe schon eingetragen? Dann tippe deinen Namen an.</p>
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
          <h3>Sonst:</h3>
        </>
      ) : null}
      <NameStep aid={aid} uid={uid} initial={localStorage.getItem('fair.name') ?? ''} onDone={() => undefined} />
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
  const cancelled = activity.status === 'cancelled';
  const settled = activity.status === 'settled' || activity.status === 'done';
  const closed = settled || cancelled;
  const owner = activity.createdBy === uid;
  const step = Math.max(result.stepCents, 100);
  const now = Date.now();
  const end = activity.endsAt ?? endOfDay(activity.startsAt);
  const isToday = activity.startsAt <= endOfDay(now) && end >= startOfDay(now);
  const planned = activity.startsAt > endOfDay(now);
  const over = !closed && now > end && data.expenses.length > 0;
  const helloKey = `fair.hello.${aid}`;
  const [hello, setHello] = useState(() => {
    try {
      return isToday && !closed && localStorage.getItem(helloKey) !== toInputDate(now);
    } catch {
      return false;
    }
  });
  const skipKey = `fair.payee.skip.${aid}`;
  const [payeeAsk, setPayeeAsk] = useState(() => {
    try {
      return !localStorage.getItem(skipKey);
    } catch {
      return true;
    }
  });
  const [payeeSheet, setPayeeSheet] = useState(false);
  const pending = data.requests.filter((r) => r.status === 'pending' && !(r.uid && activity.memberUids.includes(r.uid)));
  const active = data.members.filter(isActive);
  // Ausgeschiedene bleiben sichtbar, wenn sie etwas übernommen haben (Nachvollziehbarkeit)
  const shown = data.members.filter((m) => isActive(m) || isInvolved(m.id, data.expenses));
  const exits = data.payments.filter((p) => p.kind === 'exit');
  const exitsDone = exits.filter((p) => p.status === 'received' || p.status === 'closed').length;
  const doorOpen = !!activity.joinOpen && !closed;
  const showPayeeAsk = payeeAsk && !cancelled && !me.leftAt && !data.payees[me.id] && data.members.filter(isActive).length >= 2;
  const gone = !!me.leftAt;
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
      {gone ? (
        <p className="card warn-card">
          Du bist am {time(me.leftAt!)} ausgeschieden. Du kannst hier weiter mitlesen{exits.length ? ' und deinen Teilausgleich erledigen' : ''}, aber nichts mehr eintragen.
        </p>
      ) : null}
      {!gone && pending.map((r) => (
        <RequestCard key={r.id} ctx={ctx} req={r} />
      ))}
      {cancelled ? (
        <div className="card warn-card">
          <p>
            <strong>Abgesagt</strong>
            {activity.doneAt ? ` am ${time(activity.doneAt)}` : ''}. Es gab keine Ausgaben, also ist nichts auszugleichen.
          </p>
          {owner ? (
            <button className="btn" onClick={() => updateActivity(aid, { status: 'open', doneAt: null })}>
              Doch stattfinden lassen
            </button>
          ) : null}
        </div>
      ) : null}
      {hello && !gone ? (
        <div className="card hello pop">
          <p>
            <strong>Heute geht's los!</strong> Tragt Ausgaben am besten gleich ein, dann ist der Ausgleich am Ende schnell gemacht.
          </p>
          <button
            className="icon-btn"
            aria-label="Ausblenden"
            onClick={() => {
              try {
                localStorage.setItem(helloKey, toInputDate(Date.now()));
              } catch {
                /* egal */
              }
              setHello(false);
            }}
          >
            ×
          </button>
        </div>
      ) : null}
      {over && !gone ? (
        <button className="card settled-strip" onClick={() => go(`/a/${aid}/settle`)}>
          Laut Plan vorbei. Ausgleich ansehen ›
        </button>
      ) : null}
      {doorOpen && !gone && active.length < 2 ? <InviteCard ctx={ctx} /> : null}
      {showPayeeAsk ? (
        <div className="card">
          <p>
            <strong>Wie möchtest du später Geld bekommen?</strong> Falls dir am Ende jemand etwas zurückgibt.
          </p>
          <div className="bar">
            <button
              className="btn"
              onClick={() => {
                try {
                  localStorage.setItem(skipKey, '1');
                } catch {
                  /* egal */
                }
                setPayeeAsk(false);
              }}
            >
              Später
            </button>
            <button className="btn primary grow" onClick={() => setPayeeSheet(true)}>
              Festlegen
            </button>
          </div>
        </div>
      ) : null}
      {exits.length > 0 && !settled ? (
        <button className="card settled-strip" onClick={() => go(`/a/${aid}/settle`)}>
          Teilausgleich · {exitsDone} von {exits.length} {exits.length === 1 ? 'Zahlung' : 'Zahlungen'} erledigt ›
        </button>
      ) : null}
      {settled ? (
        <button className="card settled-strip" onClick={() => go(`/a/${aid}/settle`)}>
          {ctx.changed
            ? 'Nach dem Ausgleich wurde etwas korrigiert. Nachausgleich ansehen ›'
            : activity.status === 'done'
              ? 'Alles ausgeglichen. ›'
              : `Ausgleich vereinbart · ${doneCount} von ${data.payments.length} Zahlungen erledigt ›`}
        </button>
      ) : null}
      <div className="card hero-card pop">
        <Art kind={artFor(activity)} />
        <small className="hero-title">
          {activity.title}
          {activity.topic && activity.topic !== activity.title ? ` · ${activity.topic}` : ''}
        </small>
        <small className="muted">{planned ? `Geplant für ${dateRange(activity.startsAt, activity.endsAt)}` : dateRange(activity.startsAt, activity.endsAt)}</small>
        <strong className="hero-total">
          <CountUp cents={result.totalCents} />
        </strong>
        <small>gemeinsam ausgegeben</small>
        <div className="avatar-row" aria-label={`${active.length} Personen`}>
          {active.map((m) => (
            <Avatar key={m.id} member={m} size={34} />
          ))}
        </div>
      </div>
      <h3 className="section">Bisher übernommen</h3>
      <div className="tiles-2">
        {shown.map((m, i) => {
          const paid = result.paid[m.id] ?? 0;
          return (
            <div className="card tile-person pop" key={m.id} style={{ animationDelay: `${0.15 + i * 0.05}s` }}>
              <div className="tile-head">
                <Avatar member={m} size={28} />
                <span className="tile-name">{m.name}</span>
                {m.id === me.id ? <span className="you">du</span> : null}
              </div>
              <div className={`tile-amount ${paid === 0 ? 'zero' : ''}`}>{euro(paid)}</div>
              {m.leftAt ? <small className="gone-note">vorzeitig gegangen</small> : null}
              {standing && !settled && !m.leftAt ? <small>{standingText(result.balances[m.id] ?? 0, step, result.toleranceCents)}</small> : null}
            </div>
          );
        })}
      </div>
      <div className="links">
        {!closed ? (
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
      {doorOpen && !gone && active.length >= 2 ? (
        <button className="link center-link" onClick={() => go(`/a/${aid}/info`)}>
          Gruppe ist offen · weitere Personen einladen ›
        </button>
      ) : null}
      {!closed && !gone ? (
        <button className="btn wide" onClick={() => go(`/a/${aid}/settle`)}>
          Ausgleich ansehen
        </button>
      ) : null}
      {toast ? <p className="toast">{toast}</p> : null}
      {gone || cancelled ? null : <div className="dock">
        <button className="btn primary grow big" onClick={() => setSheet('new')}>
          <PlusIcon /> Ausgabe
        </button>
        {!settled ? (
          <button className="btn coral big" onClick={() => setSheet('all')}>
            Für alle
          </button>
        ) : null}
      </div>}
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
      {payeeSheet ? (
        <Sheet title="Wie möchtest du Geld bekommen?" onClose={() => setPayeeSheet(false)}>
          <PayeeForm
            name={me.name}
            self
            initial={data.payees[me.id] ?? rememberedPayee()}
            onSave={(p) => {
              savePayee(aid, me.id, p, true);
              setPayeeSheet(false);
              setPayeeAsk(false);
            }}
          />
        </Sheet>
      ) : null}
    </main>
  );
}

/** Einladen: QR-Code und Link. Bei offener Tür ist man nach dem Scannen sofort dabei. */
function InviteCard({ ctx, big = true }: { ctx: Ctx; big?: boolean }) {
  const { activity, aid } = ctx;
  const [note, setNote] = useState('');
  const link = inviteLink(aid, activity.token);
  const open = !!activity.joinOpen && activity.status === 'open';
  return (
    <div className={`card invite ${big ? 'pop' : ''}`}>
      {big ? <h3>Jetzt die anderen dazuholen</h3> : null}
      <p className="muted">
        {open
          ? 'Lass den QR-Code scannen. Wer scannt, gibt seinen Namen ein und ist sofort dabei.'
          : 'Die Gruppe ist geschlossen. Wer jetzt scannt, kann den Beitritt nur anfragen; alle, die die App nutzen, müssen zustimmen.'}
      </p>
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
    </div>
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

/** Braucht diese Änderung eine Begründung? (nach dem Ausgleich oder später als 12 Stunden nach dem Eintragen) */
export function needsReason(activity: Activity, existing: Expense | null): boolean {
  if (activity.status !== 'open') return true;
  return existing != null && Date.now() - existing.createdAt > EDIT_WINDOW_MS;
}

export function ExpenseSheet(props: { ctx: Ctx; existing: Expense | null; quick: boolean; onClose: (message?: string) => void }) {
  const { ctx, existing } = props;
  const { data, activity, me, aid, uid, byId } = ctx;
  // Wählbar: wer noch dabei ist, plus wer in dieser Ausgabe schon vorkommt
  const pickable = data.members.filter(
    (m) => isActive(m) || (existing != null && (existing.payerId === m.id || existing.participants.some((p) => p.memberId === m.id))),
  );
  const activeMembers = data.members.filter(isActive);
  const everyone = () => Object.fromEntries(activeMembers.map((m) => [m.id, 1]));
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

  const topicKey = themeKey(`${activity.title} ${activity.topic ?? ''}`);
  const [personal] = useState(() => personalLabels(topicKey));
  // „Anteile anpassen“: doppelt oder halb zählen; automatisch an, wenn die Ausgabe schon so gespeichert ist
  const [adjust, setAdjust] = useState(() => existing?.participants.some((p) => p.weight !== 1) ?? false);
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
  const selected = pickable.filter((m) => (weights[m.id] ?? 0) > 0);
  const allOn = selected.length === activeMembers.length && selected.every((m) => isActive(m) && weights[m.id] === 1);
  const valid = cents != null && label.trim().length > 0 && (treat || selected.length > 0) && reasonOk;
  const tap = (id: string) => {
    const w = weights[id] ?? 0;
    // normal: an/aus. Beim Anpassen: normal → doppelt → halb → nicht dabei
    const next = adjust ? (w === 0 ? 1 : w === 1 ? 2 : w === 2 ? 0.5 : 0) : w > 0 ? 0 : 1;
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
    if (!existing) rememberLabel(clean, topicKey);
    const who = payer === me.id ? 'Du hast' : `${byId[payer]?.name} hat`;
    props.onClose(existing ? 'Gespeichert.' : `${who} ${euro(cents)} für ${clean} übernommen`);
  };

  return (
    <Sheet title={existing ? 'Ausgabe ändern' : props.quick ? 'Für alle' : 'Neue Ausgabe'} onClose={() => props.onClose()}>
      {reasonNeeded ? (
        <p className="warn">
          {activity.status !== 'open'
            ? 'Der Ausgleich ist schon vereinbart. Änderungen sind möglich, brauchen aber eine kurze Begründung und werden für alle sichtbar festgehalten. Bereits erledigte Zahlungen bleiben bestehen; die Differenz wird als Nachausgleich verrechnet.'
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
        {pickable.map((m) => (
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
            {pickable.map((m) => (
              <Chip key={m.id} on={(weights[m.id] ?? 0) > 0} onClick={() => tap(m.id)}>
                {m.name}
                {weightMark(weights[m.id] ?? 0)}
              </Chip>
            ))}
          </div>
          {adjust ? (
            <p className="muted">Mehrmals antippen: normal → doppelter Anteil (×2) → halber Anteil (½) → nicht dabei.</p>
          ) : (
            <button className="link quiet" onClick={() => setAdjust(true)}>
              Anteile anpassen (z. B. doppelte Portion)
            </button>
          )}
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
    const then = data.members.filter((m) => m.createdAt <= e.spentAt && (!m.leftAt || m.leftAt > e.spentAt));
    if (then.length > 0 && then.every((m) => ids.includes(m.id))) return 'für alle';
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
        <button className="card row" key={e.id} onClick={() => !me.leftAt && setEdit(e)}>
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
  const [title, setTitle] = useState(activity.title);
  const [from, setFrom] = useState(toInputDate(activity.startsAt));
  const [to, setTo] = useState(toInputDate(activity.endsAt ?? activity.startsAt));
  const [myName, setMyName] = useState(me.name);
  const [nameNote, setNameNote] = useState('');
  const [leaving, setLeaving] = useState<Member | null>(null);
  const [payeeSheet, setPayeeSheet] = useState(false);
  const [cancelSheet, setCancelSheet] = useState(false);
  const active = data.members.filter(isActive);
  const everything = [...data.expenses, ...data.deleted];
  const owner = activity.createdBy === uid;
  const s = activity.settings;
  const days = s.reminderDays ?? 3;
  const open = activity.status === 'open';
  const fromMs = fromInputDate(from);
  const toMs = fromInputDate(to);
  const datesOk = fromMs != null && toMs != null && toMs >= fromMs;
  const datesChanged = datesOk && (fromMs !== startOfDay(activity.startsAt) || endOfDay(toMs!) !== (activity.endsAt ?? endOfDay(activity.startsAt)));
  const taken = (n: string, except?: string) => data.members.some((m) => isActive(m) && m.id !== except && sameName(m.name, n));
  const canCancel = owner && open && data.expenses.length === 0 && data.payments.length === 0;
  const myPayee = data.payees[me.id];
  return (
    <main>
      <Header title="So rechnen wir" back={`/a/${aid}`} />
      <div className="card summary">
        <p>
          <strong>{activity.title}</strong>
        </p>
        {activity.topic && activity.topic !== activity.title ? <p>Anlass: {activity.topic}</p> : null}
        <p>{dateRange(activity.startsAt, activity.endsAt)}</p>
        <p>{active.length} Personen</p>
        <p>Modus: {modeName(s.mode)}</p>
        <p>{roundingText(s.roundingStepCents, s.toleranceCents)}</p>
        <p>Zahlen und Bestätigen innerhalb von {days} {days === 1 ? 'Tag' : 'Tagen'} nach dem Ausgleich</p>
        <p>Ausgaben lassen sich 12 Stunden lang frei korrigieren, danach nur mit Begründung.</p>
      </div>
      <p className="fair">{FAIR_TEXT}</p>
      {!me.leftAt ? (
        <>
          <h3>Dein Name</h3>
          <div className="inline">
            <input value={myName} onChange={(e) => setMyName(e.target.value)} maxLength={30} />
            <button
              className="btn"
              disabled={!myName.trim() || myName.trim() === me.name}
              onClick={() => {
                const n = myName.trim().slice(0, 30);
                if (taken(n, me.id)) return setNameNote(`Einen „${n}“ gibt es schon. Bitte mit Zusatz, z. B. „${n} B.“`);
                renameMember(aid, me.id, n);
                setNameNote('Gespeichert.');
              }}
            >
              Ändern
            </button>
          </div>
          {nameNote ? <p className="muted">{nameNote}</p> : null}
          <h3>Dein Zahlungsweg</h3>
          <button className="card row" onClick={() => setPayeeSheet(true)}>
            <span className="grow">{myPayee ? payeeSummary(myPayee) : 'Noch nicht festgelegt'}</span>
            <span className="chev">›</span>
          </button>
        </>
      ) : null}
      {owner ? (
        <>
          <h3>Was habt ihr vor?</h3>
          <div className="inline">
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} />
            <button className="btn" disabled={!title.trim() || title.trim() === activity.title} onClick={() => updateActivity(aid, { title: title.trim() })}>
              Speichern
            </button>
          </div>
          <h3>Wann?</h3>
          <div className="date-row">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="von" />
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-label="bis" />
          </div>
          {!datesOk ? <p className="warn">Das Ende liegt vor dem Anfang.</p> : null}
          {datesChanged ? (
            <button className="btn" onClick={() => updateActivity(aid, { startsAt: fromMs!, endsAt: endOfDay(toMs!) })}>
              Termin speichern
            </button>
          ) : null}
          <h3>Bild</h3>
          <div className="art-pick">
            {[...ART_KINDS, { key: 'none', name: 'Kein Bild' }].map((k) => {
              const current = activity.picture || '';
              const on = current === k.key || (!current && artFor({ title: activity.title, topic: activity.topic }) === k.key);
              return (
                <button key={k.key} className={on ? 'on' : ''} onClick={() => updateActivity(aid, { picture: k.key })} aria-pressed={on}>
                  {k.key === 'none' ? <span className="none">–</span> : <Art kind={k.key} />}
                  {k.name}
                </button>
              );
            })}
          </div>
          {activity.picture ? (
            <button className="link quiet" onClick={() => updateActivity(aid, { picture: '' })}>
              Wieder automatisch passend zum Namen
            </button>
          ) : (
            <p className="muted">Das Bild wird automatisch passend zum Namen gewählt.</p>
          )}
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
          <h3>Rechenart</h3>
          <div className="chips">
            {MODES.map((m) => (
              <Chip
                key={m.id}
                on={(s.mode === 'exact') === (m.id === 'exact')}
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
      {!me.leftAt ? (
        <>
          <h3>Freunde einladen</h3>
          {open && owner ? (
            <label className="switch">
              <input type="checkbox" checked={!!activity.joinOpen} onChange={(e) => setJoinOpen(aid, e.target.checked)} />
              <span>{activity.joinOpen ? 'Gruppe offen: Wer scannt, ist sofort dabei' : 'Gruppe geschlossen: Neue brauchen die Zustimmung aller'}</span>
            </label>
          ) : null}
          <InviteCard ctx={ctx} big={false} />
          <p className="muted">
            {activity.joinOpen && open
              ? 'Sobald alle da sind, kannst du die Gruppe schließen. Beim Ausgleich schließt sie automatisch.'
              : 'Ausgaben von vor dem Beitritt werden nicht auf neue Personen verteilt.'}
          </p>
          <h3>Person ohne App hinzufügen</h3>
          <div className="inline">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" maxLength={30} />
            <button
              className="btn"
              disabled={!name.trim()}
              onClick={() => {
                if (taken(name)) return setNote(`Einen „${name.trim()}“ gibt es schon. Bitte mit Zusatz, z. B. „${name.trim()} B.“`);
                const direct = activity.memberUids.length <= 1 || !!activity.joinOpen;
                requestName(aid, uid, name.trim().slice(0, 30), activity.memberUids, data.members.length, !!activity.joinOpen);
                setNote(direct ? `${name.trim()} ist dabei.` : 'Vorschlag gesendet. Die anderen müssen noch zustimmen.');
                setName('');
              }}
            >
              Hinzufügen
            </button>
          </div>
          {note ? <p className="muted center">{note}</p> : null}
        </>
      ) : null}
      {open && !me.leftAt ? (
        <>
          <h3>Personen</h3>
          {active.map((m) => {
            const involved = isInvolved(m.id, everything);
            const self = m.id === me.id;
            const canAct = self ? !(owner && !involved) : owner && !m.uid;
            return (
              <div className="card row" key={m.id}>
                <Avatar member={m} size={32} />
                <span className="grow">
                  <strong>{self ? `${m.name} (du)` : m.name}</strong>
                  <small>{m.uid ? 'nutzt die App' : 'ohne App'}</small>
                </span>
                {canAct ? (
                  <button className="btn" onClick={() => setLeaving(m)}>
                    {involved ? (self ? 'Vorzeitig gehen' : 'Geht vorzeitig') : self ? 'Ich bin raus' : 'Entfernen'}
                  </button>
                ) : null}
              </div>
            );
          })}
          <p className="muted">
            Austreten geht ohne Weiteres, solange jemand in keiner Ausgabe vorkommt. Sonst bekommt nur diese Person einen Teilausgleich, und die anderen
            rechnen hier weiter.
          </p>
        </>
      ) : null}
      {canCancel ? (
        <>
          <h3>Findet nicht statt?</h3>
          <button className="btn wide" onClick={() => setCancelSheet(true)}>
            Veranstaltung absagen
          </button>
        </>
      ) : null}
      {cancelSheet ? (
        <Sheet title="Veranstaltung absagen" onClose={() => setCancelSheet(false)}>
          <p>
            „{activity.title}“ wird für alle als <strong>abgesagt</strong> markiert und wandert unter „Abgeschlossen“. Es gibt keine Ausgaben, also ist nichts auszugleichen. Du
            kannst das später rückgängig machen.
          </p>
          <div className="bar">
            <button className="btn" onClick={() => setCancelSheet(false)}>
              Abbrechen
            </button>
            <button
              className="btn primary grow"
              onClick={() => {
                updateActivity(aid, { status: 'cancelled', doneAt: Date.now(), joinOpen: false });
                setCancelSheet(false);
                go(`/a/${aid}`);
              }}
            >
              Absagen
            </button>
          </div>
        </Sheet>
      ) : null}
      {payeeSheet ? (
        <Sheet title="Dein Zahlungsweg" onClose={() => setPayeeSheet(false)}>
          <PayeeForm
            name={me.name}
            self
            initial={myPayee ?? rememberedPayee()}
            onSave={(p) => {
              savePayee(aid, me.id, p, true);
              setPayeeSheet(false);
            }}
          />
        </Sheet>
      ) : null}
      {leaving ? <LeaveSheet ctx={ctx} member={leaving} involved={isInvolved(leaving.id, everything)} onClose={() => setLeaving(null)} /> : null}
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

/** Austreten: ohne Ausgaben einfach raus, sonst Teilausgleich nur für diese Person. */
function LeaveSheet({ ctx, member, involved, onClose }: { ctx: Ctx; member: Member; involved: boolean; onClose: () => void }) {
  const { activity, aid, data, uid, me, byId } = ctx;
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const self = member.id === me.id;
  const days = activity.settings.reminderDays ?? 3;
  const plan = useMemo(
    () => (involved ? exitPlan(member.id, data.members.map((m) => m.id), data.expenses, activity.settings, countedTransfers(data.payments, false)) : []),
    [involved, member.id, data.members, data.expenses, data.payments, activity.settings],
  );
  const name = (id: string) => (id === me.id ? 'Du' : (byId[id]?.name ?? '?'));
  const who = self ? 'Du' : member.name;

  const go1 = async () => {
    setBusy(true);
    setError('');
    try {
      if (involved) {
        leaveWithSettlement(aid, uid, member.id, plan, days);
        onClose();
        go(plan.length ? `/a/${aid}/settle` : `/a/${aid}`);
      } else if (self) {
        await leaveGroup(aid, uid, member.id);
        go('/');
      } else {
        removeMember(aid, member.id, uid);
        onClose();
      }
    } catch (e) {
      console.error(e);
      setError('Das hat nicht geklappt. Bitte prüfe die Internetverbindung.');
      setBusy(false);
    }
  };

  return (
    <Sheet title={involved ? 'Vorzeitig gehen' : self ? 'Ich bin raus' : `${member.name} entfernen`} onClose={onClose}>
      {!involved ? (
        <p>
          {self
            ? 'Du kommst in keiner Ausgabe vor. Du verlässt die Gruppe und siehst sie danach nicht mehr.'
            : `${member.name} kommt in keiner Ausgabe vor und wird aus der Gruppe genommen.`}
        </p>
      ) : (
        <>
          <p>
            {who} {self ? 'bist' : 'ist'} schon an Ausgaben beteiligt. Deshalb gibt es einen <strong>Teilausgleich nur für {self ? 'dich' : member.name}</strong>
            . Die anderen rechnen in dieser Aktivität einfach weiter.
          </p>
          {plan.length === 0 ? (
            <p className="card center">{who} {self ? 'bist' : 'ist'} ungefähr ausgeglichen. Es ist nichts zu zahlen.</p>
          ) : (
            plan.map((p, i) => (
              <div className="card pay" key={i}>
                <Avatar member={byId[p.from]} size={36} />
                <span className="grow">
                  <strong>
                    {name(p.from)} → {name(p.to)}
                  </strong>
                  <small>Teilausgleich</small>
                </span>
                <span className="amount">{euro(p.amountCents)}</span>
              </div>
            ))
          )}
          <p className="muted">
            Ab jetzt {self ? 'bist du' : `ist ${member.name}`} bei neuen Ausgaben nicht mehr dabei. Bezahlt und bestätigt wird wie beim Ausgleich. Im Bericht
            wird der Austritt mit Datum vermerkt.
          </p>
        </>
      )}
      {!online ? <p className="warn">Dafür brauchst du kurz Internet.</p> : null}
      {error ? <p className="warn">{error}</p> : null}
      <div className="bar">
        <button className="btn" onClick={onClose}>
          Abbrechen
        </button>
        <button className="btn primary grow" disabled={busy || !online} onClick={go1}>
          {involved ? 'Austreten mit Teilausgleich' : self ? 'Gruppe verlassen' : 'Entfernen'}
        </button>
      </div>
    </Sheet>
  );
}
