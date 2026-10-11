// Zahlungsangaben: erst den Weg wählen (Überweisung, PayPal, bar), dann nur die passenden Felder.
import { useState } from 'react';
import { cleanPaypal, isValidIban, paypalKind } from '../core/pay';
import { Payee, payeeMethod } from '../store';

type Method = NonNullable<Payee['method']>;
const METHODS: { id: Method; name: string }[] = [
  { id: 'bank', name: 'Überweisung' },
  { id: 'paypal', name: 'PayPal' },
  { id: 'cash', name: 'Bar' },
];

export function PayeeForm(props: {
  /** wessen Angaben: „du“ (self) oder der Name der anderen Person */
  name: string;
  self: boolean;
  initial: Omit<Payee, 'id'> | null;
  onSave: (payee: Omit<Payee, 'id'>) => void;
  onSkip?: () => void;
  skipLabel?: string;
  saveLabel?: string;
}) {
  const { self, name, initial } = props;
  const [method, setMethod] = useState<Method | null>(payeeMethod(initial ? { id: '', ...initial } : null) ?? null);
  const [holder, setHolder] = useState(initial?.holder ?? '');
  const [iban, setIban] = useState(initial?.iban ?? '');
  const [paypal, setPaypal] = useState(initial?.paypal ?? '');
  const ibanOk = isValidIban(iban);
  const kind = paypalKind(paypal);
  const valid = method === 'cash' || (method === 'bank' && ibanOk && holder.trim() !== '') || (method === 'paypal' && kind != null);
  const whose = self ? 'Deine' : `${name}s`;

  const save = () => {
    if (!valid || !method) return;
    // Nur der gewählte Weg wird gespeichert; Angaben eines vorher gewählten Wegs fallen weg.
    props.onSave({
      method,
      holder: method === 'bank' ? holder.trim().slice(0, 70) : '',
      iban: method === 'bank' ? iban.replace(/\s+/g, '').toUpperCase() : '',
      paypal: method === 'paypal' ? cleanPaypal(paypal).slice(0, 80) : '',
    });
  };

  return (
    <div className="payee-form">
      <div className="seg" role="radiogroup" aria-label="Zahlungsweg">
        {METHODS.map((m) => (
          <button key={m.id} role="radio" aria-checked={method === m.id} className={method === m.id ? 'on' : ''} onClick={() => setMethod(m.id)}>
            {m.name}
          </button>
        ))}
      </div>
      {method === 'bank' ? (
        <>
          <label className="field">
            <span>{whose} Bankverbindung · Name des Kontoinhabers</span>
            <input value={holder} onChange={(e) => setHolder(e.target.value)} maxLength={70} autoComplete={self ? 'name' : 'off'} />
          </label>
          <label className="field">
            <span>IBAN</span>
            <input value={iban} onChange={(e) => setIban(e.target.value)} maxLength={40} autoCapitalize="characters" placeholder="DE…" />
          </label>
          {iban.trim() && !ibanOk ? <p className="warn">Diese IBAN ist nicht gültig. Bitte prüfe sie.</p> : null}
        </>
      ) : null}
      {method === 'paypal' ? (
        <>
          <label className="field">
            <span>{self ? 'Dein' : `${name}s`} PayPal: E-Mail, Handynummer oder PayPal.Me-Name</span>
            <input value={paypal} onChange={(e) => setPaypal(e.target.value)} maxLength={80} autoCapitalize="none" autoCorrect="off" />
          </label>
          {paypal.trim() && !kind ? <p className="warn">Das sieht weder nach E-Mail, Handynummer noch PayPal.Me-Name aus.</p> : null}
          {kind === 'handle' ? <p className="muted">Mit PayPal.Me öffnet sich PayPal später direkt mit dem richtigen Betrag.</p> : null}
          {kind === 'email' || kind === 'phone' ? (
            <p className="muted">Gut. Beim Bezahlen zeigt die App {kind === 'email' ? 'die E-Mail' : 'die Nummer'} und den Betrag zum Kopieren und öffnet PayPal.</p>
          ) : null}
        </>
      ) : null}
      {method === 'cash' ? <p className="muted">{self ? 'Dann gibt man dir das Geld einfach bar.' : `${name} bekommt das Geld bar.`}</p> : null}
      {self ? <p className="muted small-print">Die Angaben sehen nur die Mitglieder dieser Aktivität. Ändern geht jederzeit.</p> : null}
      <button className="btn primary wide" disabled={!valid} onClick={save}>
        {props.saveLabel ?? 'Speichern'}
      </button>
      {props.onSkip ? (
        <button className="link" onClick={props.onSkip}>
          {props.skipLabel ?? 'Später entscheiden'}
        </button>
      ) : null}
    </div>
  );
}

/** Kurzbeschreibung für „Wie beim letzten Mal“. */
export function payeeSummary(p: Omit<Payee, 'id'>): string {
  const m = payeeMethod({ id: '', ...p });
  if (m === 'cash') return 'Bar';
  if (m === 'bank') return `Überweisung an ${p.holder} (…${p.iban.slice(-4)})`;
  if (m === 'paypal') return `PayPal: ${p.paypal}`;
  return '';
}
