import { useEffect, useMemo, useState } from 'react';
import { markSeen, Reminder, remindersFor, shouldPopup, unseen } from '../reminders';
import {
  completeJoin,
  createActivity,
  enterAs,
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
import { Backdrop, Brand, Chip, FAIR_TEXT, go, Header, MODES, modeName, roundingText, Sheet } from '../ui';

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const STATUS: { id: string; name: string; match: (s: MyActivity['status']) => boolean }[] = [
  { id: 'all', name: 'Alle', match: () => true },
  { id: 'open', name: 'Laufend', match: (s) => s === 'open' || s === 'pending' },
  { id: 'settled', name: 'Zahlungen offen', match: (s) => s === 'settled' },
  { id: 'done', name: 'Erledigt', match: (s) => s === 'done' },
];
const STATUS_TEXT: Record<MyActivity['status'], string> = {
  pending: 'wartet auf Zustimmung',
  open: 'läuft',
  settled: 'Kassensturz gemacht, Zahlungen offen',
  done: 'erledigt',
};

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
  const list = useMyActivities(uid);
  const [text, setText] = useState('');
  const [status, setStatus] = useState('all');
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const live = (list ?? []).filter((a) => a.status !== 'done' && a.status !== 'pending').map((a) => a.id);
  const signals = useSignals(uid, live);
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

  const date = (a: MyActivity) => new Date(a.startsAt || a.joinedAt);
  const years = [...new Set((list ?? []).map((a) => date(a).getFullYear()))].sort((a, b) => b - a);
  const needle = text.trim().toLowerCase();
  const shown = (list ?? []).filter((a) => {
    const d = date(a);
    if (year && d.getFullYear() !== Number(year)) return false;
    if (month && d.getMonth() + 1 !== Number(month)) return false;
    if (day && d.getDate() !== Number(day)) return false;
    if (!STATUS.find((s) => s.id === status)!.match(a.status)) return false;
    if (!needle) return true;
    return [a.title, a.topic, ...(a.names ?? [])].some((v) => (v ?? '').toLowerCase().includes(needle));
  });
  const filtered = Boolean(needle || year || month || day || status !== 'all');

  return (
    <main>
      <Backdrop />
      <div className="hero">
        <Brand />
        <p>Gemeinsam erleben. Nebenbei erfassen. Am Ende fair ausgleichen.</p>
      </div>
      <button className="btn primary big" onClick={() => go('/new')}>
        Neue Aktivität
      </button>
      {reminders.length > 0 ? (
        <button className="card reminder-strip" onClick={() => setPopup(true)}>
          {reminders.length === 1 ? '1 Erinnerung' : `${reminders.length} Erinnerungen`} · ansehen
        </button>
      ) : null}
      {list == null ? <p className="muted center">Lädt …</p> : null}
      {list != null && list.length > 0 ? (
        <>
          <div className="search">
            <input
              type="search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Suchen: Name, Anlass, Person"
              aria-label="Archiv durchsuchen"
            />
            <button className={`btn ${showFilter || filtered ? 'on' : ''}`} onClick={() => setShowFilter(!showFilter)} aria-expanded={showFilter}>
              Filter
            </button>
          </div>
          {showFilter ? (
            <div className="card filters">
              <div className="chips">
                {STATUS.map((s) => (
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
          {shown.map((a) => (
            <button className="card row" key={a.id} onClick={() => go(a.status === 'pending' ? `/join/${a.id}/${a.token}` : `/a/${a.id}`)}>
              <span className="grow">
                <strong>{a.title}</strong>
                {a.topic ? <small>{a.topic}</small> : null}
                <small>
                  {date(a).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })} · {STATUS_TEXT[a.status]}
                </small>
              </span>
              <span className="chev">›</span>
            </button>
          ))}
          {shown.length === 0 ? <p className="muted center">Nichts gefunden.</p> : null}
        </>
      ) : null}
      {list != null && list.length === 0 ? (
        <p className="muted center">Noch keine Aktivität. Lege eine an oder öffne den Einladungslink deiner Freunde.</p>
      ) : null}
      {popup ? <ReminderPopup items={reminders} onClose={() => setPopup(false)} /> : null}
    </main>
  );
}

const DURATIONS = [
  { id: 'today', name: 'Nur heute', days: 1 },
  { id: 'evening', name: 'Ein Abend', days: 1 },
  { id: 'weekend', name: 'Wochenende', days: 3 },
  { id: 'days', name: 'Mehrere Tage', days: 7 },
  { id: 'trip', name: 'Reise', days: 21 },
];
const ROUNDINGS: { id: string; name: string; step: number | null }[] = [
  { id: 'smart', name: 'Intelligent runden', step: null },
  { id: '100', name: 'Auf 1 € runden', step: 100 },
  { id: '50', name: 'Auf 0,50 € runden', step: 50 },
  { id: '1', name: 'Centgenau', step: 1 },
];
const TOLERANCES: { name: string; value: number | null }[] = [
  { name: 'passend zur Rundung', value: null },
  { name: 'unter 1 €', value: 100 },
  { name: 'unter 2 €', value: 200 },
  { name: 'unter 5 €', value: 500 },
  { name: 'nichts ignorieren', value: 0 },
];
const METHODS = [
  { id: 'sepa_qr', name: 'QR-Code für Banküberweisung' },
  { id: 'paypal', name: 'PayPal' },
  { id: 'bank', name: 'Überweisungsdaten anzeigen' },
  { id: 'later', name: 'Später entscheiden' },
];

export function Wizard({ uid }: { uid: string }) {
  const online = useOnline();
  const [step, setStep] = useState(0);
  const [myName, setMyName] = useState(localStorage.getItem('fair.name') ?? '');
  const [duration, setDuration] = useState('today');
  const [mode, setMode] = useState<Settings['mode']>('relaxed');
  const [rounding, setRounding] = useState<number | null>(null);
  const [tolerance, setTolerance] = useState<number | null>(null);
  const [methods, setMethods] = useState<string[]>(['later']);
  const [title, setTitle] = useState(new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'short' }));
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pickMode = (m: Settings['mode']) => {
    setMode(m);
    if (m === 'exact') {
      setRounding(1);
      setTolerance(0);
    } else if (rounding === 1) {
      setRounding(null);
      setTolerance(null);
    }
  };
  const toggleMethod = (id: string) => {
    if (id === 'later') return setMethods(['later']);
    const next = methods.filter((m) => m !== 'later');
    setMethods(next.includes(id) ? next.filter((m) => m !== id) : [...next, id]);
  };
  const canNext = step !== 0 || myName.trim().length > 0;

  const finish = async () => {
    setBusy(true);
    setError('');
    try {
      const days = DURATIONS.find((d) => d.id === duration)?.days ?? 1;
      const aid = await createActivity(uid, {
        title: title.trim().slice(0, 60) || 'Unsere Kasse',
        topic: topic.trim().slice(0, 60),
        myName: myName.trim().slice(0, 30),
        others: [],
        duration,
        endsAt: Date.now() + days * 86400000,
        settings: { mode, roundingStepCents: rounding, toleranceCents: tolerance, paymentMethods: methods, reminderDays: 3 },
      });
      go(`/a/${aid}`);
    } catch (e) {
      setError('Das hat nicht geklappt. Bitte prüfe deine Internetverbindung und versuche es noch einmal.');
      console.error(e);
      setBusy(false);
    }
  };

  const steps = [
    <section key="who">
      <h2>Los geht's</h2>
      <label className="field">
        <span>Dein Name</span>
        <input value={myName} onChange={(e) => setMyName(e.target.value)} maxLength={30} autoComplete="given-name" autoFocus />
      </label>
      <label className="field">
        <span>Name der Aktivität</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} />
      </label>
      <label className="field">
        <span>Anlass (optional, hilft beim Wiederfinden)</span>
        <input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={60} placeholder="z. B. Schiffsausflug, Birkenkopf" />
      </label>
      <p className="muted">Die anderen trägst du nicht ein: Am Ende bekommst du einen QR-Code. Wer ihn scannt, gibt selbst seinen Namen ein und ist dabei.</p>
    </section>,
    <section key="long">
      <h2>Wie lange läuft eure gemeinsame Kasse?</h2>
      <div className="tiles">
        {DURATIONS.map((d) => (
          <button key={d.id} className={`tile ${duration === d.id ? 'on' : ''}`} onClick={() => setDuration(d.id)}>
            {d.name}
          </button>
        ))}
      </div>
    </section>,
    <section key="mode">
      <h2>Wie genau möchtet ihr abrechnen?</h2>
      <div className="tiles one">
        {MODES.map((m) => (
          <button key={m.id} className={`tile ${mode === m.id ? 'on' : ''}`} onClick={() => pickMode(m.id)}>
            <strong>
              {m.name}
              {m.id === 'relaxed' ? ' · empfohlen' : ''}
            </strong>
            <small>{m.text}</small>
          </button>
        ))}
      </div>
      <details className="hint">
        <summary>Was heißt hier „fair“?</summary>
        <p>{FAIR_TEXT}</p>
      </details>
    </section>,
    <section key="round">
      <h2>Wie behandeln wir kleine Unterschiede?</h2>
      <div className="tiles">
        {ROUNDINGS.map((r) => (
          <button
            key={r.id}
            className={`tile ${rounding === r.step ? 'on' : ''}`}
            onClick={() => {
              setRounding(r.step);
              if (r.step === 1) setTolerance(0);
              else if (tolerance === 0) setTolerance(null);
            }}
          >
            {r.name}
          </button>
        ))}
      </div>
      {rounding !== 1 ? (
        <>
          <h3>Kleine Beträge nicht ausgleichen</h3>
          <div className="chips">
            {TOLERANCES.map((t) => (
              <Chip key={t.name} on={tolerance === t.value} onClick={() => setTolerance(t.value)}>
                {t.name}
              </Chip>
            ))}
          </div>
        </>
      ) : null}
      <p className="muted">
        {rounding == null
          ? 'Intelligent: Beim Kassensturz schlägt die App eine Rundung vor, die zu euren Beträgen passt.'
          : roundingText(rounding, tolerance)}
      </p>
    </section>,
    <section key="pay">
      <h2>Wie möchtet ihr am Ende bezahlen?</h2>
      <div className="tiles one">
        {METHODS.map((m) => (
          <button key={m.id} className={`tile ${methods.includes(m.id) ? 'on' : ''}`} onClick={() => toggleMethod(m.id)}>
            {m.name}
          </button>
        ))}
      </div>
      <p className="muted">Mehrere sind möglich. Ihr könnt das beim Kassensturz noch ändern.</p>
    </section>,
    <section key="sum">
      <h2>So rechnen wir</h2>
      <div className="card summary">
        <p>
          <strong>{title.trim() || 'Unsere Kasse'}</strong>
        </p>
        {topic.trim() ? <p>Anlass: {topic.trim()}</p> : null}
        <p>{DURATIONS.find((d) => d.id === duration)?.name}</p>
        <p>Modus: {modeName(mode)}</p>
        <p>{roundingText(rounding, tolerance)}</p>
        <p>Zahlen und Bestätigen innerhalb von 3 Tagen nach dem Kassensturz</p>
      </div>
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
          <button
            className="btn primary grow"
            disabled={!canNext}
            onClick={() => setStep(step + 1)}
          >
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

/** Beitreten per Einladungslink: Anfrage stellen, auf Zustimmung aller warten, dann eintreten. */
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
      .then(() => enterAs(aid, uid, request.name))
      .then(() => go(`/a/${aid}`))
      .catch((e) => {
        console.error(e);
        setError('Die Zustimmung ist da, aber der Beitritt hat noch nicht geklappt. Bitte gleich noch einmal öffnen.');
      });
  }, [request?.status, uid, aid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wurde die Gruppe inzwischen (wieder) geöffnet, klappt der Beitritt ohne Zustimmung
  useEffect(() => {
    if (request?.status !== 'pending' || busy) return;
    completeJoin(uid, aid)
      .then(() => enterAs(aid, uid, request.name))
      .then(() => go(`/a/${aid}`))
      .catch(() => undefined);
  }, [request?.status, uid, aid]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    setBusy(true);
    setError('');
    try {
      const clean = name.trim().slice(0, 30);
      if (await joinNow(uid, aid, token, clean, invite?.title ?? 'Aktivität')) return go(`/a/${aid}`);
    } catch (e) {
      console.error(e);
      setError('Das hat nicht geklappt. Bitte prüfe die Internetverbindung.');
    }
    setBusy(false);
  };

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
