import { euro } from '../core/pay';
import { Header, modeName, roundingText } from '../ui';
import type { Ctx } from './Activity';
import { statusText } from './Settle';

const ACTION = { create: 'angelegt', update: 'geändert', delete: 'gelöscht', restore: 'wiederhergestellt' };
const dt = (ms: number) =>
  new Date(ms).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Druckansicht: alles auf einen Blick, über den Druckdialog auch als PDF speicherbar. */
export function Report(ctx: Ctx) {
  const { activity, data, result, byId, aid } = ctx;
  const name = (id: string) => byId[id]?.name ?? '?';
  const meta = data.settlement;
  const all = [...data.expenses].sort((a, b) => a.spentAt - b.spentAt);
  const shared: Record<string, number> = {};
  for (const e of all) if (!e.isTreat) shared[e.payerId] = (shared[e.payerId] ?? 0) + e.amountCents;
  const forWhom = (ids: string[], treat: boolean) =>
    treat ? 'übernommen (Einladung)' : ids.length === data.members.length ? 'alle' : ids.map(name).join(', ');
  const s = activity.settings;
  const view = meta ?? result;
  const involved = (id: string) => all.some((e) => e.payerId === id || e.participants.some((p) => p.memberId === id));
  const rows = data.members.filter((m) => !m.leftAt || involved(m.id));
  const left = data.members.filter((m) => m.leftAt).sort((a, b) => a.leftAt! - b.leftAt!);
  const roundName = (p: (typeof data.payments)[number]) => {
    if (p.round === 0) return `Teilausgleich (${name(byId[p.from]?.leftAt ? p.from : p.to)} gegangen)`;
    return p.round === 1 ? 'Ausgleich' : `Nachausgleich ${p.round - 1}`;
  };

  return (
    <main className="report">
      <div className="no-print">
        <Header title="Druckansicht" back={`/a/${aid}`} />
        <button className="btn primary wide big" onClick={() => window.print()}>
          Drucken oder als PDF speichern
        </button>
        <p className="muted center">Im Druckdialog als Ziel „Als PDF speichern“ wählen, wenn du eine Datei möchtest.</p>
      </div>

      <h1>{activity.title}</h1>
      {activity.topic ? <p>Anlass: {activity.topic}</p> : null}
      <p>
        Beginn: {dt(activity.startsAt)}
        {meta ? ` · Kassensturz: ${dt(meta.confirmedAt)}` : ' · Kassensturz noch nicht gemacht'}
      </p>
      <p>Personen: {data.members.filter((m) => !m.leftAt).map((m) => m.name).join(', ')}</p>
      {left.map((m) => (
        <p key={m.id}>
          {dt(m.leftAt!)} – {m.name} ausgeschieden
          {data.payments.some((p) => p.kind === 'exit' && (p.from === m.id || p.to === m.id))
            ? '. Teilausgleich: ' +
              data.payments
                .filter((p) => p.kind === 'exit' && (p.from === m.id || p.to === m.id))
                .map((p) => `${name(p.from)} → ${name(p.to)} ${euro(p.amountCents, true)}`)
                .join(', ')
            : involved(m.id)
              ? ', ungefähr ausgeglichen (keine Zahlung nötig)'
              : ' (war an keiner Ausgabe beteiligt)'}
        </p>
      ))}
      <p>
        Modus: {modeName(s.mode)} · {roundingText(view.stepCents, view.toleranceCents)}
      </p>

      <h2>Übersicht je Person</h2>
      <table>
        <thead>
          <tr>
            <th>Person</th>
            <th className="num">Übernommen</th>
            <th className="num">Davon Einladungen</th>
            <th className="num">Eigener Anteil</th>
            <th className="num">Unterschied</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const bal = view.balances[m.id] ?? 0;
            const paid = result.paid[m.id] ?? 0;
            const sh = shared[m.id] ?? 0;
            return (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td className="num">{euro(paid, true)}</td>
                <td className="num">{euro(paid - sh, true)}</td>
                <td className="num">{euro(sh - bal, true)}</td>
                <td className="num">{bal >= 0 ? '+' : '−'}{euro(Math.abs(bal), true)}</td>
              </tr>
            );
          })}
          <tr className="sum">
            <td>Gesamt</td>
            <td className="num">{euro(result.totalCents, true)}</td>
            <td />
            <td />
            <td />
          </tr>
        </tbody>
      </table>

      <h2>Ausgaben</h2>
      <table>
        <thead>
          <tr>
            <th>Zeit</th>
            <th>Wofür</th>
            <th>Bezahlt von</th>
            <th>Für</th>
            <th className="num">Betrag</th>
          </tr>
        </thead>
        <tbody>
          {all.map((e) => (
            <tr key={e.id}>
              <td>{dt(e.spentAt)}</td>
              <td>{e.label}</td>
              <td>{name(e.payerId)}</td>
              <td>
                {forWhom(
                  e.participants.map((p) => p.memberId).filter((id) => byId[id]),
                  e.isTreat,
                )}
                {e.participants.some((p) => p.weight !== 1) && !e.isTreat
                  ? ` (Anteile: ${e.participants.map((p) => `${name(p.memberId)} ×${String(p.weight).replace('.', ',')}`).join(', ')})`
                  : ''}
              </td>
              <td className="num">{euro(e.amountCents, true)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Ausgleichszahlungen</h2>
      {meta || data.payments.length ? (
        data.payments.length ? (
          <table>
            <thead>
              <tr>
                <th>Runde</th>
                <th>Von → An</th>
                <th className="num">Betrag</th>
                <th>Stand</th>
              </tr>
            </thead>
            <tbody>
              {data.payments.map((p) => (
                <tr key={p.id}>
                  <td>{roundName(p)}</td>
                  <td>
                    {name(p.from)} → {name(p.to)}
                  </td>
                  <td className="num">{euro(p.amountCents, true)}</td>
                  <td>
                    {statusText(p, name)}
                    {p.receivedAt ? `, ${dt(p.receivedAt)}` : ''}
                    {p.status === 'closed' ? `, Begründung: „${p.closedReason}“` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>Keine Zahlungen nötig.</p>
        )
      ) : null}
      {!meta ? (
        <>
          <p>Vorschau Kassensturz (noch nicht bestätigt):</p>
          <ul>
            {result.payments.map((p, i) => (
              <li key={i}>
                {name(p.from)} → {name(p.to)}: {euro(p.amountCents, true)}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h2>Rundung</h2>
      <ul>
        {rows.map((m) => {
          const adv = (meta ?? result).advantage[m.id] ?? 0;
          return (
            <li key={m.id}>
              {m.name}: {adv === 0 ? 'keine Abweichung' : `${euro(Math.abs(adv), true)} ${adv > 0 ? 'im Vorteil' : 'im Nachteil'} gegenüber centgenau`}
            </li>
          );
        })}
      </ul>

      <h2>Änderungsprotokoll</h2>
      {data.history.length ? (
        <table>
          <thead>
            <tr>
              <th>Zeit</th>
              <th>Wer</th>
              <th>Was</th>
              <th>Begründung</th>
            </tr>
          </thead>
          <tbody>
            {[...data.history].reverse().map((h) => (
              <tr key={h.id}>
                <td>{dt(h.at)}</td>
                <td>{h.byName}</td>
                <td>
                  {ACTION[h.action]}: {h.summary}
                </td>
                <td>{h.reason ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>Keine Einträge.</p>
      )}
      {data.deleted.length ? <p>Gelöschte Ausgaben (zählen nicht): {data.deleted.map((e) => `${e.label} ${euro(e.amountCents, true)}`).join(', ')}</p> : null}
      <p className="printed">Erstellt am {dt(Date.now())} mit Ausgleich.app</p>
    </main>
  );
}
