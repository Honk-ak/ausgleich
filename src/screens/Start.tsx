import { useEffect, useMemo, useState } from 'react';
import { markSeen, Reminder, remindersFor, shouldPopup, unseen } from '../reminders';
import {
  completeJoin,
  createActivity,
  isMemberOf,
  joinNow,
  MyActivity,
  readInvite,
  Settings,
  useMyActivities,
  useMyRequest,
  useOnline,
  useSignals,
} from '../store';
import { NameStep, PayeeStep } from './Onboard';
import { Art, artFor } from '../art';
import { Backdrop, Brand, Chip, dateRange, endOfDay, FAIR_TEXT, fromInputDate, go, Header, roundingText, Sheet, startOfDay, toInputDate } from '../ui';

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const ARCHIVE_STATUS: { id: string; name: string; match: (s: MyActivity['status']) => boolean }[] = [
  { id: 'all', name: 'Alle', match: () => true },
  { id: 'done', name: 'Erledigt', match: (s) => s === 'done' },
  { id: 'cancelled', name: 'Abgesagt', match: (s) => s === 'cancelled' },
];
const STATUS_TEXT: Record<MyActivity['status'], string> = {
  pending: 'wartet auf Zustimmung',
  open: 'läuft',
  settled: 'Ausgleich vereinbart, Zahlungen offen',
  done: 'erledigt',
  cancelled: 'abgesagt',
};
/** Erledigtes bleibt so lange oben stehen, danach rutscht es nach „Abgeschlossen“. */
const KEEP_DONE_MS = 7 * 86400000;
const SHOW_RUNNING = 3;

export function ReminderPopup({ items, onClose }: { items: Reminder[]; onClose: () => void }) {
  useEffect(() => markSeen(items), [items]);
  return (
    <Sheet title="Kurz erinnert" onClose={onClose}>
      {items.map((r) => (
        <button
          key={r.key}
          className={`card reminder ${r.due ? 'due' : ''}`}
          onClick={() => {
            onClose();
            go(`/a/${r.aid}${r.target === 'settle' ? '/settle' : ''}`);
          }}
        >
          {r.text}
        </button>
      ))}
      <button className="btn wide" onClick={onClose}>
        Später
      </button>
    </Sheet>
  );
}

export function Home({ uid }: { uid: string }) {
  const copies = useMyActivities(uid);
  const [text, setText] = useState('');
  const [status, setStatus] = useState('all');
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const live = (copies ?? []).filter((a) => a.status !== 'done' && a.status !== 'pending' && a.status !== 'cancelled').map((a) => a.id);
  const signals = useSignals(uid, live);
  // Die persönliche Kopie mit dem aktuellen Stand der Aktivität zusammenführen (z. B. abgesagt, neuer Termin)
  const list = useMemo(
    () =>
      copies?.map((c) => {
        const a = signals[c.id]?.activity;
        if (!a) return c;
        return { ...c, title: a.title, topic: a.topic ?? '', status: a.status, startsAt: a.startsAt, endsAt: a.endsAt, doneAt: a.doneAt ?? null, picture: a.picture };
      }) ?? null,
    [copies, signals],
  );
  const reminders = useMemo(
    () =>
      unseen(
        live.flatMap((aid) => {
          const s = signals[aid];
          if (!s) return [];
          const title = list?.find((a) => a.id === aid)?.title ?? '';
          return remindersFor({ aid, title, uid, ...s });
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signals, list],
  );
  const [popup, setPopup] = useState(false);
  useEffect(() => {
    if (reminders.length > 0 && shouldPopup('home')) setPopup(true);
  }, [reminders.length]);

  const now = Date.now();
  const start = (a: MyActivity) => a.startsAt || a.joinedAt;
  const archived = (a: MyActivity) => a.status === 'cancelled' || (a.status === 'done' && (a.doneAt ?? start(a)) < now - KEEP_DONE_MS);
  const planning = (a: MyActivity) => a.status === 'open' || a.status === 'pending';
  const isToday = (a: MyActivity) => planning(a) && start(a) <= endOfDay(now) && (a.endsAt ?? endOfDay(start(a))) >= startOfDay(now);
  const isPlanned = (a: MyActivity) => planning(a) && start(a) > endOfDay(now);
  const all = list ?? [];
  const today = all.filter((a) => !archived(a) && isToday(a));
  const planned = all.filter((a) => !archived(a) && isPlanned(a)).sort((a, b) => start(a) - start(b));
  const running = all
    .filter((a) => !archived(a) && !isToday(a) && !isPlanned(a))
    .sort((a, b) => Number(b.status === 'settled') - Number(a.status === 'settled') || start(b) - start(a));
  const archive = all.filter(archived).sort((a, b) => start(b) - start(a));

  const date = (a: MyActivity) => new Date(start(a));
  const years = [...new Set(archive.map((a) => date(a).getFullYear()))].sort((a, b) => b - a);
  const needle = text.trim().toLowerCase();
  const found = archive.filter((a) => {
    const d = date(a);
    if (year && d.getFullYear() !== Number(year)) return false;
    if (month && d.getMonth() + 1 !== Number(month)) return false;
    if (day && d.getDate() !== Number(day)) return false;
    if (!ARCHIVE_STATUS.find((s) => s.id === status)!.match(a.status)) return false;
    if (!needle) return true;
    return [a.title, a.topic, ...(a.names ?? [])].some((v) => (v ?? '').toLowerCase().includes(needle));
  });
  const filtered = Boolean(needle || year || month || day || status !== 'all');
  const open = (a: MyActivity) => go(a.status === 'pending' ? `/join/${a.id}/${a.token}` : `/a/${a.id}`);
  const row = (a: MyActivity) => (
    <button className="card row" key={a.id} onClick={() => open(a)}>
      <span className="grow">
        <strong>{a.title}</strong>
        <small>
          {dateRange(start(a), a.endsAt)} · {a.status === 'done' ? <span className="tick">✓ erledigt</span> : isPlanned(a) && a.status === 'open' ? 'geplant' : STATUS_TEXT[a.status]}
        </small>
      </span>
      <span className="chev">›</span>
    </button>
  );

  return (
    <main>
      <Backdrop />
      <div className="hero">
        <Brand />
        <p>Gemeinsam erleben. Nebenbei erfassen. Am Ende fair ausgleichen.</p>
      </div>
      {reminders.length > 0 ? (
        <button className="card reminder-strip" onClick={() => setPopup(true)}>
          {reminders.length === 1 ? '1 Erinnerung' : `${reminders.length} Erinnerungen`} · ansehen
        </button>
      ) : null}
      {list == null ? <p className="muted center">Lädt …</p> : null}

      {today.map((a) => (
        <button className="card today-card pop" key={a.id} onClick={() => open(a)}>
          <Art kind={artFor(a)} />
          <span className="today-body">
            <span className="kicker">Heute</span>
            <strong>{a.title}</strong>
            <small className="muted">
              {dateRange(start(a), a.endsAt)} · {a.status === 'pending' ? STATUS_TEXT.pending : 'weiter erfassen ›'}
            </small>
          </span>
        </button>
      ))}

      <button className="btn primary big" onClick={() => go('/new')}>
        Neue Aktivität
      </button>

      {planned.length > 0 ? (
        <>
          <h3 className="section">Geplant</h3>
          {planned.map(row)}
        </>
      ) : null}

      {running.length > 0 ? (
        <>
          <h3 className="section">Laufend</h3>
          {running.slice(0, SHOW_RUNNING).map(row)}
          {running.length > SHOW_RUNNING ? (
            <details className="fold">
              <summary>Weitere anzeigen ({running.length - SHOW_RUNNING})</summary>
              <div>{running.slice(SHOW_RUNNING).map(row)}</div>
            </details>
          ) : null}
        </>
      ) : null}

      {archive.length > 0 ? (
        <details className="fold">
          <summary>Abgeschlossen ({archive.length})</summary>
          <div>
            <div className="search">
              <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Suchen: Name, Person" aria-label="Abgeschlossene durchsuchen" />
              <button className={`btn ${showFilter || filtered ? 'on' : ''}`} onClick={() => setShowFilter(!showFilter)} aria-expanded={showFilter}>
                Filter
              </button>
            </div>
            {showFilter ? (
              <div className="card filters">
                <div className="chips">
                  {ARCHIVE_STATUS.map((s) => (
                    <Chip key={s.id} on={status === s.id} onClick={() => setStatus(s.id)}>
                      {s.name}
                    </Chip>
                  ))}
                </div>
                <div className="selects">
                  <select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Jahr">
                    <option value="">Jahr</option>
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                  <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Monat">
                    <option value="">Monat</option>
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <select value={day} onChange={(e) => setDay(e.target.value)} aria-label="Tag">
                    <option value="">Tag</option>
                    {Array.from({ length: 31 }, (_, i) => (
                      <option key={i} value={i + 1}>
                        {i + 1}.
                      </option>
                    ))}
                  </select>
                </div>
                {filtered ? (
                  <button
                    className="link"
                    onClick={() => {
                      setText('');
                      setStatus('all');
                      setYear('');
                      setMonth('');
                      setDay('');
                    }}
                  >
                    Filter zurücksetzen
                  </button>
                ) : null}
              </div>
            ) : null}
            {found.map(row)}
            {found.length === 0 ? <p className="muted center">Nichts gefunden.</p> : null}
          </div>
        </details>
      ) : null}

      {list != null && list.length === 0 ? (
        <p className="muted center">Noch keine Aktivität. Lege eine an oder öffne den Einladungslink deiner Freunde.</p>
      ) : null}
      {popup ? <ReminderPopup items={reminders} onClose={() => setPopup(false)} /> : null}
    </main>
  );
}

const ROUNDINGS: { id: string; name: string; step: number | null }[] = [
  { id: 'smart', name: 'Intelligent runden', step: null },
  { id: '100', name: 'Auf 1 € runden', step: 100 },
  { id: '50', name: 'Auf 0,50 € runden', step: 50 },
];
const TOLERANCES: { name: string; value: number | null }[] = [
  { name: 'passend zur Rundung', value: null },
  { name: 'unter 1 €', value: 100 },
  { name: 'unter 2 €', value: 200 },
  { name: 'unter 5 €', value: 500 },
  { name: 'nichts ignorieren', value: 0 },
];

export function Wizard({ uid }: { uid: string }) {
  const online = useOnline();
  const [step, setStep] = useState(0);
  const [myName, setMyName] = useState(localStorage.getItem('fair.name') ?? '');
  const [title, setTitle] = useState('');
  const [from, setFrom] = useState(toInputDate(Date.now()));
  const [multi, setMulti] = useState(false);
  const [to, setTo] = useState(toInputDate(Date.now() + 86400000));
  const [exact, setExact] = useState(false);
  const [rounding, setRounding] = useState<number | null>(null);
  const [tolerance, setTolerance] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const start = fromInputDate(from);
  const endDay = multi ? fromInputDate(to) : start;
  const datesOk = start != null && endDay != null && endDay >= start;
  const canNext = myName.trim().length > 0 && title.trim().length > 0 && datesOk;
  const kind = artFor({ title });

  const finish = async () => {
    if (!datesOk || start == null || endDay == null) return;
    setBusy(true);
    setError('');
    try {
      const aid = await createActivity(uid, {
        title: title.trim().slice(0, 60),
        myName: myName.trim().slice(0, 30),
        startsAt: start,
        endsAt: endOfDay(endDay),
        settings: {
          mode: exact ? 'exact' : 'relaxed',
          roundingStepCents: exact ? 1 : rounding,
          toleranceCents: exact ? 0 : tolerance,
          paymentMethods: [],
          reminderDays: 3,
        },
      });
      go(`/a/${aid}`);
    } catch (e) {
      setError('Das hat nicht geklappt. Bitte prüfe deine Internetverbindung und versuche es noch einmal.');
      console.error(e);
      setBusy(false);
    }
  };

  const steps = [
    <section key="who" className="stack">
      <h2>Los geht's</h2>
      <label className="field">
        <span>Dein Name</span>
        <input value={myName} onChange={(e) => setMyName(e.target.value)} maxLength={30} autoComplete="given-name" />
      </label>
      <label className="field">
        <span>Was habt ihr vor?</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="z. B. Schiffsausflug Bodensee" />
      </label>
      {title.trim() ? <Art kind={kind} className="wizard-art" /> : null}
      <div className="field">
        <span>Wann?</span>
        <div className={multi ? 'date-row' : ''}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={multi ? 'von' : 'Datum'} />
          {multi ? <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-label="bis" /> : null}
        </div>
      </div>
      <label className="switch">
        <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} />
        <span>Mehrere Tage</span>
      </label>
      {!datesOk ? <p className="warn">Das Ende liegt vor dem Anfang.</p> : null}
      <p className="muted">Die anderen trägst du nicht ein: Gleich bekommst du einen QR-Code. Wer ihn scannt, gibt selbst seinen Namen ein und ist dabei.</p>
    </section>,
    <section key="how" className="stack">
      <h2>Wie rechnen wir?</h2>
      <div className="tiles one">
        <button className={`tile ${!exact ? 'on' : ''}`} onClick={() => setExact(false)}>
          <strong>Ungefähr · empfohlen</strong>
          <small>Größere Unterschiede gleichen wir aus, Kleinigkeiten lassen wir liegen. Gerundet wird auf glatte Beträge.</small>
        </button>
        <button className={`tile ${exact ? 'on' : ''}`} onClick={() => setExact(true)}>
          <strong>Centgenau</strong>
          <small>Jeder Cent wird ausgeglichen.</small>
        </button>
      </div>
      {!exact ? (
        <details className="hint">
          <summary>Rundung anpassen</summary>
          <div className="chips">
            {ROUNDINGS.map((r) => (
              <Chip key={r.id} on={rounding === r.step} onClick={() => setRounding(r.step)}>
                {r.name}
              </Chip>
            ))}
          </div>
          <h3>Kleine Beträge nicht ausgleichen</h3>
          <div className="chips">
            {TOLERANCES.map((t) => (
              <Chip key={t.name} on={tolerance === t.value} onClick={() => setTolerance(t.value)}>
                {t.name}
              </Chip>
            ))}
          </div>
          <p className="muted">{rounding == null ? 'Intelligent: Beim Ausgleich schlägt die App eine Rundung vor, die zu euren Beträgen passt.' : roundingText(rounding, tolerance)}</p>
        </details>
      ) : null}
      <details className="hint">
        <summary>Was heißt hier „fair“?</summary>
        <p>{FAIR_TEXT}</p>
      </details>
      <p className="muted">Wer bei einer Ausgabe mehr oder weniger dabei war (z. B. doppelte Portion), lässt sich dort jederzeit unter „Anteile anpassen“ einstellen.</p>
      {!online ? <p className="warn">Zum Anlegen brauchst du kurz Internet.</p> : null}
      {error ? <p className="warn">{error}</p> : null}
    </section>,
  ];

  return (
    <main>
      <Header title="Neue Aktivität" back={''} />
      <div className="dots" aria-label={`Schritt ${step + 1} von ${steps.length}`}>
        {steps.map((_, i) => (
          <span key={i} className={i <= step ? 'on' : ''} />
        ))}
      </div>
      {steps[step]}
      <div className="bar">
        {step > 0 ? (
          <button className="btn" onClick={() => setStep(step - 1)} disabled={busy}>
            Zurück
          </button>
        ) : null}
        {step < steps.length - 1 ? (
          <button className="btn primary grow" disabled={!canNext} onClick={() => setStep(step + 1)}>
            Weiter
          </button>
        ) : (
          <button className="btn primary grow" onClick={finish} disabled={busy || !online}>
            {busy ? 'Wird angelegt …' : 'Los geht’s'}
          </button>
        )}
      </div>
    </main>
  );
}

export function Join({ uid, aid, token }: { uid: string; aid: string; token: string }) {
  const online = useOnline();
  const request = useMyRequest(aid, uid);
  const [invite, setInvite] = useState<{ title: string } | null | undefined>(undefined);
  const [name, setName] = useState(localStorage.getItem('fair.name') ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    isMemberOf(aid).then((member) => {
      if (!live) return;
      if (member) return go(`/a/${aid}`);
      readInvite(aid, token)
        .then((i) => live && setInvite(i))
        .catch(() => live && setInvite(null));
    });
    return () => {
      live = false;
    };
  }, [aid, token]);

  useEffect(() => {
    if (request?.status !== 'approved') return;
    completeJoin(uid, aid)
      .then(() => setStage({ kind: 'name', initial: request.name }))
      .catch((e) => {
        console.error(e);
        setError('Die Zustimmung ist da, aber der Beitritt hat noch nicht geklappt. Bitte gleich noch einmal öffnen.');
      });
  }, [request?.status, uid, aid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wurde die Gruppe inzwischen (wieder) geöffnet, klappt der Beitritt ohne Zustimmung
  useEffect(() => {
    if (request?.status !== 'pending' || busy) return;
    completeJoin(uid, aid)
      .then(() => setStage({ kind: 'name', initial: request.name }))
      .catch(() => undefined);
  }, [request?.status, uid, aid]); // eslint-disable-line react-hooks/exhaustive-deps

  const [stage, setStage] = useState<null | { kind: 'name'; initial: string } | { kind: 'payee'; memberId: string }>(null);

  const send = async () => {
    setBusy(true);
    setError('');
    try {
      const clean = name.trim().slice(0, 30);
      if (await joinNow(uid, aid, token, clean, invite?.title ?? 'Aktivität')) return setStage({ kind: 'name', initial: clean });
    } catch (e) {
      console.error(e);
      setError('Das hat nicht geklappt. Bitte prüfe die Internetverbindung.');
    }
    setBusy(false);
  };

  if (stage)
    return (
      <main>
        <Header title={invite?.title ?? 'Beitreten'} back={''} />
        {stage.kind === 'name' ? (
          <NameStep aid={aid} uid={uid} initial={stage.initial} auto onDone={(memberId) => setStage({ kind: 'payee', memberId })} />
        ) : (
          <PayeeStep aid={aid} memberId={stage.memberId} onDone={() => go(`/a/${aid}`)} />
        )}
      </main>
    );

  return (
    <main>
      <Header title="Beitreten" back={''} />
      {invite === undefined || request === undefined ? <p className="muted center">Einen Moment …</p> : null}
      {invite === null ? (
        <p className="card">Dieser Einladungslink ist nicht gültig, oder gerade fehlt das Internet.</p>
      ) : null}
      {invite && (request === null || (busy && request?.status === 'pending')) ? (
        <>
          <h2>„{invite.title}“</h2>
          <p>Wie heißt du? Mit diesem Namen sehen dich die anderen.</p>
          <label className="field">
            <span>Dein Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} autoComplete="given-name" />
          </label>
          <button className="btn primary wide big" disabled={!name.trim() || busy || !online} onClick={send}>
            {busy ? 'Einen Moment …' : 'Beitreten'}
          </button>
          <p className="muted">Ausgaben von vor deinem Beitritt werden nur unter den bisherigen Personen aufgeteilt.</p>
        </>
      ) : null}
      {request?.status === 'pending' && !busy ? (
        <div className="card">
          <p>
            <strong>Die Gruppe ist schon geschlossen.</strong>
          </p>
          <p className="muted">
            Deshalb stimmen die anderen deinem Beitritt kurz zu. Sobald alle zugestimmt haben, bist du automatisch dabei. Bisher {request.approvals.length === 1 ? 'hat 1 Person' : `haben ${request.approvals.length} Personen`} zugestimmt.
          </p>
        </div>
      ) : null}
      {request?.status === 'rejected' ? <p className="card">Deine Anfrage wurde abgelehnt. Sprich am besten kurz mit der Gruppe.</p> : null}
      {request?.status === 'approved' && !error ? <p className="muted center">Alle haben zugestimmt. Du wirst hinzugefügt …</p> : null}
      {error ? <p className="warn">{error}</p> : null}
    </main>
  );
}
