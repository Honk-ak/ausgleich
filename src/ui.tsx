// Kleine gemeinsame Bausteine der Oberfläche.
import QRCode from 'qrcode';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { euro } from './core/pay';
import type { Member, Settings } from './store';

export const COLORS = ['#1F5F66', '#B4553D', '#4F7880', '#94604F', '#2E7B74', '#B65F44', '#3D5A6C', '#835447'];

export const FAIR_TEXT =
  'Fair heißt bei uns nicht automatisch centgenau. Wir schauen, wer etwas bezahlt hat und für wen es gedacht war, ' +
  'gleichen die größeren Unterschiede aus und lassen Kleinigkeiten bewusst liegen. So trägt niemand deutlich mehr ' +
  'als die anderen – und aus eurem Abend wird keine Buchhaltung.';

/** Rechenart. „balanced“ gibt es nur noch bei älteren Aktivitäten und zählt als „Ungefähr“. */
export const MODES: { id: Settings['mode']; name: string; text: string }[] = [
  { id: 'relaxed', name: 'Ungefähr', text: 'Größere Unterschiede gleichen wir aus, Kleinigkeiten lassen wir liegen.' },
  { id: 'exact', name: 'Centgenau', text: 'Jeder Cent wird ausgeglichen.' },
];

export const modeName = (mode: Settings['mode']) => (mode === 'exact' ? 'Centgenau' : 'Ungefähr');

export function roundingText(step: number | null, tolerance: number | null): string {
  if (step == null) return 'Rundung: intelligent (Vorschlag beim Ausgleich)';
  const round = step <= 1 ? 'centgenau' : `Rundung auf ${euro(step)}`;
  const tol = tolerance == null ? (step <= 1 ? 0 : step * 2) : tolerance;
  return tol > 0 ? `${round} · Unterschiede unter ${euro(tol)} gleichen wir nicht aus` : round;
}

export function go(path: string) {
  location.hash = path;
}

export function inviteLink(aid: string, token: string): string {
  return `${location.origin}${location.pathname}#/join/${aid}/${token}`;
}

export function Avatar({ member, size = 40 }: { member: Member | undefined; size?: number }) {
  const name = member?.name ?? '?';
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, background: COLORS[(member?.color ?? 0) % COLORS.length], fontSize: size * 0.42 }}
      aria-hidden="true"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function Chip(props: { on: boolean; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" className={`chip ${props.on ? 'on' : ''}`} aria-pressed={props.on} onClick={props.onClick} disabled={props.disabled}>
      {props.children}
    </button>
  );
}

export function Sheet(props: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <div className="sheet" role="dialog" aria-label={props.title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{props.title}</h2>
          <button className="icon-btn" onClick={props.onClose} aria-label="Schließen">
            ✕
          </button>
        </div>
        {props.children}
      </div>
    </div>
  );
}

export function Header(props: { title: ReactNode; back?: string; right?: ReactNode }) {
  return (
    <header className="top">
      {props.back != null ? (
        <button className="icon-btn" onClick={() => go(props.back!)} aria-label="Zurück">
          ‹
        </button>
      ) : (
        <span className="icon-btn ghost" />
      )}
      <h1>{props.title}</h1>
      {props.right ?? <span className="icon-btn ghost" />}
    </header>
  );
}

export function Qr({ text, label }: { text: string; label: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(text, { errorCorrectionLevel: 'M', margin: 2, width: 520 }).then((url) => live && setSrc(url));
    return () => {
      live = false;
    };
  }, [text]);
  return <div className="qr">{src ? <img src={src} alt={label} /> : null}</div>;
}

/** Teilen über das Teilen-Menü des Handys; sonst in die Zwischenablage. Gibt zurück, was passiert ist. */
export async function share(text: string, url?: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (navigator.share) {
      await navigator.share(url ? { text, url } : { text });
      return 'shared';
    }
    await navigator.clipboard.writeText(url ? `${text}\n${url}` : text);
    return 'copied';
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') return 'shared';
    return 'failed';
  }
}

export async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function time(ms: number): string {
  const d = new Date(ms);
  const today = new Date().toDateString() === d.toDateString();
  const clock = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  return today ? clock : `${d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}, ${clock}`;
}

/** Handy oder Tablet mit Touch-Bedienung (dort fehlt meist ein zweites Gerät zum Scannen). */
export function isPhone(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;
  } catch {
    return false;
  }
}

/** Sauberes Bild mit QR-Code und Zahlungsangaben, zum Hochladen in die Banking-App. */
export async function qrImage(args: { qr: string; lines: [string, string][] }): Promise<Blob> {
  const W = 900;
  const lineH = 96;
  const H = 120 + 620 + args.lines.length * lineH + 90;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#111111';
  ctx.font = '600 44px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Überweisung', W / 2, 80);
  const qrUrl = await QRCode.toDataURL(args.qr, { errorCorrectionLevel: 'M', margin: 2, width: 600 });
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = qrUrl;
  });
  ctx.drawImage(img, (W - 600) / 2, 110, 600, 600);
  ctx.textAlign = 'left';
  let y = 110 + 600 + 50;
  for (const [label, value] of args.lines) {
    ctx.fillStyle = '#666666';
    ctx.font = '400 28px system-ui, sans-serif';
    ctx.fillText(label, 70, y);
    ctx.fillStyle = '#111111';
    ctx.font = '600 34px system-ui, sans-serif';
    ctx.fillText(value.slice(0, 44), 70, y + 42);
    y += lineH;
  }
  ctx.fillStyle = '#999999';
  ctx.font = '400 24px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Erstellt mit Ausgleich.app', W / 2, H - 30);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Bild'))), 'image/png'));
}

/** Logo: zwei Kreise, die aufeinander zugehen und sich überschneiden. */
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle className="logo-a" cx="25" cy="32" r="14" fill="#1F5F66" />
      <circle className="logo-b" cx="39" cy="32" r="14" fill="#E07A5F" fillOpacity="0.85" />
    </svg>
  );
}

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand ${small ? 'small' : ''}`}>
      <Logo size={small ? 30 : 48} />
      <span>
        Ausgleich<span className="brand-dot">.app</span>
      </span>
    </span>
  );
}

/** Zwei weiche Kreise im Hintergrund, die beim Öffnen zueinander finden. */
export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <span className="bd-a" />
      <span className="bd-b" />
    </div>
  );
}

export function PlusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return true;
  }
}

/** Zählt beim ersten Anzeigen einmal sanft hoch; spätere Änderungen erscheinen sofort. */
export function CountUp({ cents }: { cents: number }) {
  const first = useRef(true);
  const [shown, setShown] = useState(reducedMotion() ? cents : 0);
  useEffect(() => {
    if (!first.current || reducedMotion() || cents === 0) {
      setShown(cents);
      return;
    }
    first.current = false;
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 1100);
      setShown(Math.round(cents * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [cents]);
  return <>{shown === cents ? euro(cents) : euro(Math.round(shown / 100) * 100)}</>;
}

// Datum: Eingabefeld (JJJJ-MM-TT) ↔ Millisekunden, immer in Ortszeit
const pad = (n: number) => String(n).padStart(2, '0');
export function toInputDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function fromInputDate(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : null;
}
export const startOfDay = (ms: number) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};
export const endOfDay = (ms: number) => startOfDay(ms) + 86400000 - 1;
/** „Sa., 17. Okt.“ bzw. „Sa., 17. – Mo., 19. Okt.“ */
export function dateRange(start: number, end?: number | null): string {
  const f = (ms: number) => new Date(ms).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
  if (!end || startOfDay(end) === startOfDay(start)) return f(start);
  return `${f(start)} – ${f(end)}`;
}
