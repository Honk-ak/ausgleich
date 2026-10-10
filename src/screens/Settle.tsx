import { useState } from 'react';
import { cleanPaypalHandle, epcPayload, euro, formatIban, isValidIban, paypalMeLink } from '../core/pay';
import { confirmSettlement, Payment, recalcSettlement, rememberedPayee, savePayee, setPaymentStatus, useOnline } from '../store';
import { Avatar, Chip, copy, go, Header, isPhone, Qr, qrImage, roundingText, share, Sheet, time } from '../ui';
import type { Ctx } from './Activity';

function day(ms: number) {
  return new Date(ms).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function statusText(p: Payment, name: (id: string) => string): string {
  switch (p.status) {
    case 'open':
      return Date.now() > p.dueAt ? `offen · war bis ${day(p.dueAt)} geplant` : `offen · bis ${day(p.dueAt)}`;
    case 'sent':
      return `${p.method === 'bar' ? 'bar gegeben' : 'überwiesen'} · wartet auf Bestätigung von ${name(p.to)}`;
    case 'received':
      return `erhalten · bestätigt von ${name(p.to)}`;
    case 'closed':
      return 'ohne Bestätigung abgeschlossen';
  }
}

export function Settle(ctx: Ctx) {
  const { activity, data, result, aid, uid, byId, me, changed } = ctx;
  const online = useOnline();
  const [details, setDetails] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const meta = data.settlement;
  const days = activity.settings.reminderDays ?? 3;
  const name = (id: string) => (id === me.id ? 'Du' : (byId[id]?.name ?? '?'));
  const plainName = (id: string) => byId[id]?.name ?? '?';
  const view = meta ?? result;
  const busy = !online || data.pendingWrites;
  const rounds = [...new Set(data.payments.map((p) => p.round))];
  const finished = data.payments.length > 0 && data.payments.every((p) => p.status === 'received' || p.status === 'closed');

  const Card = ({ p }: { p: Payment }) => (
    <button className={`card pay s-${p.status}`} onClick={() => setOpen(p.id)}>
      <Avatar member={byId[p.from]} size={36} />
      <span className="grow">
        <strong>
          {name(p.from)} → {name(p.to)}
        </strong>
        <small>{statusText(p, plainName)}</small>
      </span>
      <span className="amount">{euro(p.amountCents)}</span>
    </button>
  );

  return (
    <main>
      <Header
        title="Kassensturz"
        back={`/a/${aid}`}
        right={
          <button className="icon-btn" onClick={() => go(`/a/${aid}/report`)} aria-label="Drucken oder als PDF speichern">
            ⎙
          </button>
        }
      />
      <div className="total">
        <small>Zusammen ausgegeben</small>
        <strong>{euro(result.totalCents)}</strong>
      </div>

      {!meta ? (
        <>
          {result.payments.length === 0 ? (
            <p className="card center">Ihr seid schon ungefähr ausgeglichen. Es ist nichts zu zahlen.</p>
          ) : (
            <p className="lead">Und so seid ihr wieder ungefähr ausgeglichen:</p>
          )}
          {result.payments.map((p, i) => (
            <div className="card pay" key={i}>
              <Avatar member={byId[p.from]} size={36} />
              <span className="grow">
                <strong>
                  {name(p.from)} → {name(p.to)}
                </strong>
                <small>gibt noch dazu</small>
              </span>
              <span className="amount">{euro(p.amountCents)}</span>
            </div>
          ))}
          <p className="muted center">{roundingText(result.stepCents, result.toleranceCents)}</p>
          {busy ? <p className="warn">Für den Kassensturz müssen alle Ausgaben übertragen sein. Bitte kurz ins Netz gehen.</p> : null}
          <button className="btn primary wide big" disabled={busy} onClick={() => confirmSettlement(aid, uid, result, days)}>
            Passt für uns
          </button>
          <p className="muted center">
            Bittet vorher alle, die App kurz zu öffnen, damit nichts fehlt. Danach habt ihr {days} {days === 1 ? 'Tag' : 'Tage'} zum Zahlen und Bestätigen.
          </p>
        </>
      ) : (
        <>
          {changed ? (
            <div className="card warn-card">
              <p>
                <strong>Nach dem Kassensturz wurde etwas korrigiert.</strong> Erledigte und gemeldete Zahlungen bleiben bestehen. Die Differenz sieht so aus:
              </p>
              {result.payments.length === 0 ? <p>Kein weiterer Ausgleich nötig.</p> : null}
              {result.payments.map((p, i) => (
                <p key={i}>
                  {name(p.from)} → {name(p.to)}: <strong>{euro(p.amountCents)}</strong>
                </p>
              ))}
              <button className="btn primary" disabled={busy} onClick={() => recalcSettlement(aid, uid, meta, data.payments, result, days)}>
                Nachausgleich übernehmen
              </button>
              <small>Noch offene Zahlungen werden dabei durch die neue Berechnung ersetzt.</small>
            </div>
          ) : null}
          {data.payments.length === 0 ? <p className="card center">Ihr seid ungefähr ausgeglichen. Es ist nichts zu zahlen.</p> : null}
          {finished && !changed ? <p className="lead">Alles erledigt. Ihr seid wieder ausgeglichen.</p> : null}
          {rounds.map((r) => (
            <section key={r}>
              <h3>{r === 1 ? `Ausgleich vom ${day(meta.confirmedAt)}` : `Nachausgleich ${r - 1}`}</h3>
              {data.payments
                .filter((p) => p.round === r)
                .map((p) => (
                  <Card key={p.id} p={p} />
                ))}
            </section>
          ))}
          <p className="muted center">Nur wer das Geld bekommt, kann den Eingang bestätigen.</p>
        </>
      )}

      <button className="link" onClick={() => setDetails(!details)}>
        {details ? 'Rechenweg ausblenden' : 'Rechenweg ansehen'}
      </button>
      {details ? (
        <div className="card log">
          <h3>So wurde gerechnet</h3>
          {data.members.map((m) => {
            const bal = view.balances[m.id] ?? 0;
            const adv = (meta && !changed ? meta.advantage : result.advantage)[m.id] ?? 0;
            return (
              <p key={m.id}>
                <strong>{m.name}:</strong>{' '}
                {bal === 0
                  ? 'genau ausgeglichen'
                  : bal > 0
                    ? `hat ${euro(bal, true)} mehr übernommen als verbraucht`
                    : `hat ${euro(-bal, true)} weniger übernommen als verbraucht`}
                {adv !== 0 ? `. Durch Rundung ${euro(Math.abs(adv), true)} ${adv > 0 ? 'im Vorteil' : 'im Nachteil'}` : ''}.
              </p>
            );
          })}
          <p className="muted">
            {roundingText(view.stepCents, view.toleranceCents)}. Einladungen („geht auf mich“) zählen zur Gesamtsumme, werden aber nicht aufgeteilt.
          </p>
          <button className="link" onClick={() => go(`/a/${aid}/details`)}>
            Alle Ausgaben ansehen
          </button>
        </div>
      ) : null}
      <button className="btn wide" onClick={() => go(`/a/${aid}/report`)}>
        Drucken oder als PDF speichern
      </button>
      {open && data.payments.find((p) => p.id === open) ? (
        <PaySheet ctx={ctx} payment={data.payments.find((p) => p.id === open)!} onClose={() => setOpen(null)} />
      ) : null}
    </main>
  );
}

function PaySheet({ ctx, payment: p, onClose }: { ctx: Ctx; payment: Payment; onClose: () => void }) {
  const { data, aid, byId, me, activity, uid } = ctx;
  const to = byId[p.to];
  const from = byId[p.from];
  const payee = data.payees[p.to];
  const iAmPayer = p.from === me.id;
  const iAmReceiver = p.to === me.id;
  const canClose = (iAmPayer || activity.createdBy === uid) && (p.status === 'open' || p.status === 'sent');
  const remembered = iAmReceiver ? rememberedPayee() : null;
  const [editing, setEditing] = useState(false);
  const [holder, setHolder] = useState(payee?.holder ?? remembered?.holder ?? '');
  const [iban, setIban] = useState(payee?.iban ?? remembered?.iban ?? '');
  const [paypal, setPaypal] = useState(payee?.paypal ?? remembered?.paypal ?? '');
  const [closing, setClosing] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const purpose = `${activity.title} - Ausgleich`;
  const hasBank = payee != null && payee.holder.trim() !== '' && isValidIban(payee.iban);
  const handle = payee ? cleanPaypalHandle(payee.paypal) : '';
  const [qrKind, setQrKind] = useState<'bank' | 'paypal'>(hasBank ? 'bank' : 'paypal');
  let bankQr = '';
  if (hasBank) {
    try {
      bankQr = epcPayload({ name: payee.holder, iban: payee.iban, amountCents: p.amountCents, purpose });
    } catch {
      bankQr = '';
    }
  }
  const paypalUrl = handle ? paypalMeLink(handle, p.amountCents) : '';
  const ibanOk = iban.trim() === '' || isValidIban(iban);
  const paypalOk = paypal.trim() === '' || cleanPaypalHandle(paypal) !== '';
  const canSave = ibanOk && paypalOk && (iban.trim() === '' || holder.trim() !== '') && (iban.trim() !== '' || paypal.trim() !== '');
  const bankText = hasBank ? `Empfänger: ${payee.holder}\nIBAN: ${formatIban(payee.iban)}\nBetrag: ${euro(p.amountCents, true)}\nVerwendungszweck: ${purpose}` : '';
  const act = (status: Payment['status'], extra: Partial<Payment> = {}) => {
    setPaymentStatus(aid, p, status, extra);
    onClose();
  };
  const showForm = editing || (iAmReceiver && p.status === 'open' && !hasBank && !handle);

  const payeeForm = (
    <>
      <p className="muted">
        {iAmReceiver
          ? 'Wohin soll das Geld gehen? Die Angaben sehen nur die Mitglieder dieser Aktivität.'
          : `${to?.name} hat noch nichts hinterlegt. Bar geht immer. Wenn du die Bankverbindung kennst, kannst du sie hier eintragen.`}
      </p>
      <label className="field">
        <span>Name des Kontoinhabers</span>
        <input value={holder} onChange={(e) => setHolder(e.target.value)} maxLength={70} autoComplete="name" />
      </label>
      <label className="field">
        <span>IBAN</span>
        <input value={iban} onChange={(e) => setIban(e.target.value)} maxLength={40} autoCapitalize="characters" />
      </label>
      {!ibanOk ? <p className="warn">Diese IBAN ist nicht gültig. Bitte prüfe sie.</p> : null}
      <label className="field">
        <span>PayPal.Me-Name (optional)</span>
        <input value={paypal} onChange={(e) => setPaypal(e.target.value)} maxLength={30} placeholder="z. B. AnnaBeispiel" />
      </label>
      {!paypalOk ? <p className="warn">Bitte nur den Namen hinter „paypal.me/“ eintragen.</p> : null}
      <button
        className="btn primary wide"
        disabled={!canSave}
        onClick={() => {
          savePayee(aid, p.to, { holder: holder.trim(), iban: iban.replace(/\s+/g, '').toUpperCase(), paypal: cleanPaypalHandle(paypal) });
          setEditing(false);
        }}
      >
        Zahlungsangaben speichern
      </button>
    </>
  );

  return (
    <Sheet title={`${from?.name} → ${to?.name}`} onClose={onClose}>
      <div className="total small">
        <strong>{euro(p.amountCents)}</strong>
        <small>{statusText(p, (id) => byId[id]?.name ?? '?')}</small>
      </div>

      {p.status === 'received' ? (
        <p className="card center">
          {to?.name} hat den Eingang {p.receivedAt ? `am ${time(p.receivedAt)}` : ''} bestätigt. Erledigt.
        </p>
      ) : null}
      {p.status === 'closed' ? (
        <div className="card warn-card">
          <p>
            Ohne Bestätigung von {to?.name} abgeschlossen{p.closedAt ? ` (${time(p.closedAt)})` : ''}.
          </p>
          <p>Begründung: „{p.closedReason}“</p>
        </div>
      ) : null}

      {/* Zahler: bezahlen und melden */}
      {iAmPayer && p.status === 'open' && !showForm ? (
        <>
          {!hasBank && !handle ? (
            <p className="card">
              {to?.name} hat noch keine Zahlungsangaben hinterlegt. Bitte {to?.name} kurz darum, oder gib das Geld bar. Sobald die Angaben da sind, erscheinen hier QR-Code und PayPal-Knopf.
            </p>
          ) : null}
          {bankQr && paypalUrl ? (
            <div className="chips center-chips">
              <Chip on={qrKind === 'bank'} onClick={() => setQrKind('bank')}>
                Banking-App
              </Chip>
              <Chip on={qrKind === 'paypal'} onClick={() => setQrKind('paypal')}>
                PayPal
              </Chip>
            </div>
          ) : null}
          {bankQr && (qrKind === 'bank' || !paypalUrl) ? (
            <BankTransfer
              holder={payee.holder}
              iban={payee.iban}
              amountCents={p.amountCents}
              purpose={purpose}
              qr={bankQr}
              fileName={`Ueberweisung-${to?.name ?? 'Ausgleich'}`}
            />
          ) : null}
          {paypalUrl && (qrKind === 'paypal' || !bankQr) ? (
            <>
              <a className="btn primary wide" href={paypalUrl} target="_blank" rel="noopener noreferrer">
                PayPal öffnen und senden
              </a>
              <p className="muted center">
                Auf dem Handy öffnet sich die PayPal-App mit Empfänger und Betrag; du gibst dort nur noch frei. Wenn PayPal fragt, wähle „Freunde und Familie“. Von
                einem anderen Gerät aus kannst du stattdessen diesen Code scannen:
              </p>
              <Qr text={paypalUrl} label="QR-Code für PayPal" />
            </>
          ) : null}
          {note ? <p className="muted center">{note}</p> : null}
          <div className="bar">
            <button className="btn" onClick={() => act('sent', { method: 'bar' })}>
              Bar gegeben
            </button>
            <button className="btn primary grow" onClick={() => act('sent', { method: qrKind === 'paypal' && paypalUrl ? 'PayPal' : 'Überweisung' })}>
              Habe überwiesen
            </button>
          </div>
          <p className="muted">Danach bestätigt {to?.name} den Eingang. Die App selbst sieht nicht, ob Geld angekommen ist.</p>
          <button className="link" onClick={() => setEditing(true)}>
            Zahlungsangaben von {to?.name} {hasBank || handle ? 'ändern' : 'selbst eintragen'}
          </button>
        </>
      ) : null}
      {iAmPayer && p.status === 'sent' ? (
        <>
          <p className="card center">Gemeldet. Jetzt bestätigt {to?.name} den Eingang.</p>
          <button className="link" onClick={() => act('open')}>
            Doch noch nicht gezahlt
          </button>
        </>
      ) : null}

      {/* Empfänger: Angaben hinterlegen und Eingang bestätigen */}
      {iAmReceiver && p.status === 'sent' ? (
        <>
          <p>
            {from?.name} hat {p.method === 'bar' ? 'dir das Geld bar gegeben' : `per ${p.method ?? 'Überweisung'} gezahlt`}. Ist es angekommen?
          </p>
          <button className="btn primary wide big" onClick={() => act('received')}>
            Erhalten bestätigen
          </button>
          <button className="btn wide" onClick={() => act('open')}>
            Noch nicht angekommen
          </button>
        </>
      ) : null}
      {iAmReceiver && p.status === 'open' && !showForm ? (
        <>
          <p className="muted">
            {from?.name} hat noch nicht gemeldet, dass gezahlt wurde. Wenn das Geld trotzdem schon da ist, kannst du es hier bestätigen.
          </p>
          <button className="btn primary wide" onClick={() => act('received', { method: 'ohne Meldung' })}>
            Erhalten bestätigen
          </button>
          <button className="link" onClick={() => setEditing(true)}>
            Meine Zahlungsangaben {hasBank || handle ? 'ändern' : 'hinterlegen'}
          </button>
        </>
      ) : null}

      {showForm && p.status === 'open' ? payeeForm : null}

      {!iAmPayer && !iAmReceiver && p.status !== 'received' && p.status !== 'closed' ? (
        <p className="muted center">Diese Zahlung betrifft {from?.name} und {to?.name}.</p>
      ) : null}

      {iAmPayer && p.status === 'open' && !showForm && bankText ? (
        <button
          className="link"
          onClick={async () => {
            const text = `Ich gebe dir noch ${euro(p.amountCents)} dazu (${activity.title}).${bankText ? '\n\n' + bankText : ''}`;
            const r = await share(text);
            setNote(r === 'copied' ? 'Text kopiert.' : r === 'failed' ? 'Teilen nicht möglich.' : '');
          }}
        >
          Zahlungsdaten teilen
        </button>
      ) : null}

      {/* Ausnahme */}
      {canClose && !closing ? (
        <button className="link quiet" onClick={() => setClosing(true)}>
          Ohne Bestätigung abschließen …
        </button>
      ) : null}
      {closing ? (
        <div className="card warn-card">
          <p>
            Nur für Ausnahmen, zum Beispiel wenn {to?.name} nicht mehr reagiert. Die Begründung wird dauerhaft vermerkt, und {from?.name} und {to?.name} sehen einen Hinweis.
          </p>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={3} placeholder="Begründung (mindestens 10 Zeichen)" />
          <div className="bar">
            <button className="btn" onClick={() => setClosing(false)}>
              Abbrechen
            </button>
            <button
              className="btn primary grow"
              disabled={reason.trim().length < 10}
              onClick={() => {
                setPaymentStatus(aid, p, 'closed', { closedReason: reason.trim(), closedBy: uid });
                onClose();
              }}
            >
              Abschließen
            </button>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}

/** Überweisen mit nur einem Gerät: Felder einzeln kopieren, QR-Code als Bild speichern; am Computer QR-Code zuerst. */
function BankTransfer(props: { holder: string; iban: string; amountCents: number; purpose: string; qr: string; fileName: string }) {
  const [copied, setCopied] = useState('');
  const [note, setNote] = useState('');
  const phone = isPhone();
  const amount = (props.amountCents / 100).toFixed(2).replace('.', ',');
  const fields = [
    { key: 'name', label: 'Empfänger', value: props.holder, shown: props.holder },
    { key: 'iban', label: 'IBAN', value: props.iban.replace(/\s+/g, ''), shown: formatIban(props.iban) },
    { key: 'amount', label: 'Betrag', value: amount, shown: `${amount} €` },
    { key: 'purpose', label: 'Verwendungszweck', value: props.purpose, shown: props.purpose },
  ];
  const copyField = async (key: string, value: string) => {
    if (await copy(value)) {
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? '' : c)), 2000);
    } else setNote('Kopieren nicht möglich. Bitte die Angaben abtippen.');
  };
  const saveImage = async () => {
    try {
      const blob = await qrImage({ qr: props.qr, lines: fields.map((f) => [f.label, f.shown]) });
      const file = new File([blob], `${props.fileName}.png`, { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
      if (phone && nav.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        setNote('Wähle „Bild sichern“ oder direkt deine Banking-App. Dort dann bei „Fotoüberweisung“ das Bild hochladen.');
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setNote('Bild gespeichert. In der Banking-App bei „Fotoüberweisung“ hochladen.');
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setNote('Speichern hat nicht geklappt. Ein Bildschirmfoto geht auch.');
    }
  };

  const copyList = (
    <div className="card copy-list">
      {fields.map((f) => (
        <div className="copy-row" key={f.key}>
          <span className="grow">
            <small>{f.label}</small>
            {f.shown}
          </span>
          <button className="btn small" onClick={() => copyField(f.key, f.value)}>
            {copied === f.key ? 'Kopiert ✓' : 'Kopieren'}
          </button>
        </div>
      ))}
    </div>
  );
  const qrBlock = (
    <>
      <Qr text={props.qr} label="QR-Code für die Überweisung" />
      <p className="muted center">
        {phone
          ? 'Mit einem zweiten Gerät: Banking-App öffnen, „Fotoüberweisung“ wählen und diesen Code scannen.'
          : 'Mit dem Handy in der Banking-App „Fotoüberweisung“ wählen und diesen Code scannen. Empfänger, Betrag und Zweck sind dann ausgefüllt.'}
      </p>
    </>
  );
  return (
    <>
      {phone ? (
        <>
          <p className="muted">Banking-App öffnen, neue Überweisung anlegen und die Angaben einzeln einfügen:</p>
          {copyList}
          <button className="btn wide" onClick={saveImage}>
            Als Bild speichern
          </button>
          <p className="muted">Viele Banking-Apps können bei „Fotoüberweisung“ ein gespeichertes Bild hochladen.</p>
          <details className="hint">
            <summary>QR-Code zeigen</summary>
            {qrBlock}
          </details>
        </>
      ) : (
        <>
          {qrBlock}
          {copyList}
          <button className="btn wide" onClick={saveImage}>
            Als Bild speichern
          </button>
        </>
      )}
      {note ? <p className="muted center">{note}</p> : null}
    </>
  );
}
