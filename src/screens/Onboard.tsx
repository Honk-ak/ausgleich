// Beitreten: Namen eintragen (ohne Doppelte) und freiwillig den Zahlungsweg festlegen.
import { useEffect, useRef, useState } from 'react';
import { claimName, Member, rememberedPayee, savePayee } from '../store';
import { PayeeForm, payeeSummary } from './PayeeForm';

/** Namen eintragen. Gleicher Name mit App: Zusatz nötig. Gleicher Name ohne App: „Bist du das?“ */
export function NameStep(props: { aid: string; uid: string; initial: string; auto?: boolean; onDone: (memberId: string) => void }) {
  const { aid, uid, onDone } = props;
  const [name, setName] = useState(props.initial);
  const [phase, setPhase] = useState<'input' | 'busy' | 'taken' | 'ask'>(props.auto && props.initial.trim() ? 'busy' : 'input');
  const [free, setFree] = useState<Member | null>(null);
  const [tried, setTried] = useState('');
  const [error, setError] = useState('');
  const started = useRef(false);

  const submit = async (value: string, claimFree = false) => {
    const clean = value.trim().slice(0, 30);
    if (!clean) return;
    setPhase('busy');
    setError('');
    try {
      const r = await claimName(aid, uid, clean, claimFree);
      if (r.kind === 'ok') return onDone(r.memberId);
      setTried(clean);
      if (r.kind === 'ask') {
        setFree(r.free);
        setPhase('ask');
      } else {
        setName('');
        setPhase('taken');
      }
    } catch (e) {
      console.error(e);
      setError('Das hat nicht geklappt. Bitte prüfe die Internetverbindung.');
      setPhase('input');
    }
  };

  useEffect(() => {
    if (props.auto && props.initial.trim() && !started.current) {
      started.current = true;
      submit(props.initial);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === 'busy') return <p className="muted center">Einen Moment …</p>;
  if (phase === 'ask' && free)
    return (
      <div className="card">
        <p>
          In der Gruppe steht schon <strong>„{free.name}“</strong> (ohne App). Bist du das?
        </p>
        <div className="bar">
          <button
            className="btn"
            onClick={() => {
              setName('');
              setPhase('taken');
            }}
          >
            Nein, jemand anderes
          </button>
          <button className="btn primary grow" onClick={() => submit(free.name, true)}>
            Ja, das bin ich
          </button>
        </div>
      </div>
    );
  return (
    <>
      {phase === 'taken' ? (
        <p className="warn">
          Einen „{tried}“ gibt es in der Gruppe schon. Damit es keine Verwechslung gibt, bitte mit Zusatz, z. B. „{tried} B.“ oder „{tried} aus Köln“.
        </p>
      ) : (
        <h2>Wie heißt du?</h2>
      )}
      <label className="field">
        <span>Dein Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} autoComplete="given-name" autoFocus />
      </label>
      {error ? <p className="warn">{error}</p> : null}
      <button className="btn primary wide big" disabled={!name.trim() || (phase === 'taken' && name.trim().toLowerCase() === tried.toLowerCase())} onClick={() => submit(name)}>
        Weiter
      </button>
    </>
  );
}

/** Freiwillig: Wie möchtest du später Geld bekommen? Das Handy merkt es sich für künftige Aktivitäten. */
export function PayeeStep({ aid, memberId, onDone }: { aid: string; memberId: string; onDone: () => void }) {
  const [remembered] = useState(rememberedPayee);
  const [change, setChange] = useState(false);
  const save = (p: Parameters<typeof savePayee>[2]) => {
    savePayee(aid, memberId, p, true);
    onDone();
  };
  return (
    <>
      <h2>Wie möchtest du später Geld bekommen?</h2>
      <p className="muted">Falls dir am Ende jemand etwas zurückgibt. Ganz freiwillig, du kannst das auch später festlegen.</p>
      {remembered && !change && payeeSummary(remembered) ? (
        <div className="card">
          <p>
            Wie beim letzten Mal? <strong>{payeeSummary(remembered)}</strong>
          </p>
          <div className="bar">
            <button className="btn" onClick={() => setChange(true)}>
              Anders
            </button>
            <button className="btn primary grow" onClick={() => save(remembered)}>
              Ja, übernehmen
            </button>
          </div>
          <button className="link" onClick={onDone}>
            Später entscheiden
          </button>
        </div>
      ) : (
        <PayeeForm name="" self initial={remembered} onSave={save} onSkip={onDone} saveLabel="Speichern und los" />
      )}
    </>
  );
}
