// Kleine, ruhige Bilder passend zum Anlass. Eigene Zeichnungen, flach, in den App-Farben.
// Farben kommen aus CSS-Variablen (--art-*), damit Hell- und Dunkelmodus stimmen.
import type { ReactNode } from 'react';
import { themeFor } from './suggestions';

export const ART_KINDS: { key: string; name: string }[] = [
  { key: 'schiff', name: 'Schiff & See' },
  { key: 'berge', name: 'Berge' },
  { key: 'stadt', name: 'Stadt' },
  { key: 'fahrrad', name: 'Fahrrad' },
  { key: 'reise', name: 'Reise' },
  { key: 'abend', name: 'Essen & Abend' },
  { key: 'neutral', name: 'Landschaft' },
];

/** Welches Bild? 'none' = aus, ein fester Schlüssel = von Hand gewählt, sonst automatisch aus dem Namen. */
export function artFor(a: { title: string; topic?: string; picture?: string | null }): string | null {
  if (a.picture === 'none') return null;
  if (a.picture && ART_KINDS.some((k) => k.key === a.picture)) return a.picture;
  return themeFor(`${a.title} ${a.topic ?? ''}`)?.key ?? 'neutral';
}

const sun = <circle className="a-sun" cx="156" cy="30" r="15" />;

const SCENES: Record<string, ReactNode> = {
  schiff: (
    <>
      {sun}
      <path className="a-far" d="M0 72 Q40 50 82 66 T160 58 T200 62 V82 H0Z" />
      <rect className="a-mid" x="0" y="80" width="200" height="40" />
      <path className="a-light a-line" d="M14 98 q6 -3 12 0 t12 0 M150 104 q6 -3 12 0 t12 0 M40 112 q6 -3 12 0" />
      <ellipse className="a-near" cx="104" cy="92" rx="44" ry="4" opacity=".35" />
      <path className="a-ink" d="M58 76 H150 L139 90 H69 Z" />
      <rect className="a-light" x="76" y="62" width="58" height="14" rx="2" />
      <rect className="a-light" x="90" y="52" width="30" height="10" rx="2" />
      <g className="a-ink">
        <rect x="81" y="66" width="7" height="5" rx="1" />
        <rect x="92" y="66" width="7" height="5" rx="1" />
        <rect x="103" y="66" width="7" height="5" rx="1" />
        <rect x="114" y="66" width="7" height="5" rx="1" />
        <rect x="125" y="66" width="5" height="5" rx="1" />
      </g>
      <rect className="a-acc" x="122" y="42" width="7" height="10" rx="1" />
      <path className="a-ink a-line" d="M100 52 V40" />
      <path className="a-acc" d="M100 40 L110 43 L100 46 Z" />
    </>
  ),
  berge: (
    <>
      {sun}
      <path className="a-far" d="M10 96 L66 34 L100 72 L128 44 L196 96 Z" />
      <path className="a-light" d="M66 34 L56 46 L62 44 L67 49 L72 44 L77 46 Z M128 44 L119 54 L125 52 L129 56 L134 52 L138 54 Z" />
      <path className="a-mid" d="M54 104 L108 54 L164 104 Z" />
      <path className="a-light" d="M108 54 L97 65 L104 63 L109 68 L115 63 L120 65 Z" />
      <path className="a-near" d="M0 102 Q100 90 200 102 V120 H0 Z" />
      <g className="a-ink">
        <path d="M34 84 L42 102 H26 Z" />
        <path d="M48 90 L54 104 H42 Z" />
        <path d="M168 86 L176 104 H160 Z" />
      </g>
    </>
  ),
  stadt: (
    <>
      {sun}
      <g className="a-far">
        <rect x="30" y="50" width="22" height="56" />
        <rect x="58" y="38" width="18" height="68" />
        <rect x="150" y="46" width="26" height="60" />
      </g>
      <g className="a-mid">
        <rect x="44" y="64" width="30" height="42" />
        <rect x="118" y="58" width="28" height="48" />
        <rect x="168" y="70" width="24" height="36" />
      </g>
      <path className="a-ink" d="M84 106 V52 L96 40 L108 52 V106 Z" />
      <path className="a-ink a-line" d="M96 40 V28" />
      <circle className="a-acc" cx="96" cy="58" r="5" />
      <g className="a-light">
        <rect x="50" y="70" width="5" height="6" />
        <rect x="62" y="70" width="5" height="6" />
        <rect x="50" y="82" width="5" height="6" />
        <rect x="124" y="64" width="5" height="6" />
        <rect x="135" y="64" width="5" height="6" />
        <rect x="124" y="76" width="5" height="6" />
        <rect x="90" y="72" width="12" height="8" rx="1" />
        <rect x="90" y="88" width="12" height="18" rx="6" />
      </g>
      <rect className="a-near" x="0" y="104" width="200" height="16" />
    </>
  ),
  fahrrad: (
    <>
      {sun}
      <path className="a-far" d="M0 80 Q50 58 100 74 T200 70 V96 H0 Z" />
      <path className="a-near" d="M0 104 Q100 92 200 102 V120 H0 Z" />
      <g className="a-ink a-line a-thick">
        <circle cx="76" cy="88" r="15" />
        <circle cx="130" cy="88" r="15" />
      </g>
      <g className="a-acc a-line a-thick">
        <path d="M76 88 L98 88 L120 68 L90 68 Z M98 88 L88 62 M120 68 L130 88 M120 68 L118 58" />
      </g>
      <path className="a-ink a-line a-thick" d="M82 62 H94 M112 58 H124" />
    </>
  ),
  reise: (
    <>
      {sun}
      <g className="a-light">
        <path d="M24 46 a10 10 0 0 1 18 -6 a8 8 0 0 1 14 6 Z" />
        <path d="M136 72 a9 9 0 0 1 16 -5 a7 7 0 0 1 12 5 Z" />
      </g>
      <path className="a-acc a-line a-dash" d="M8 92 Q40 86 66 70" />
      <g className="a-ink">
        <path d="M70 66 L132 52 Q142 50 143 54 Q144 58 134 60 L72 72 Z" />
        <path d="M102 60 L90 40 L98 39 L118 56 Z" />
        <path d="M98 66 L92 84 L100 84 L114 63 Z" />
        <path d="M74 70 L66 56 L72 55 L82 67 Z" />
      </g>
      <path className="a-far" d="M0 104 Q60 92 120 102 T200 98 V120 H0 Z" />
    </>
  ),
  abend: (
    <>
      <path className="a-sun" d="M154 16 a17 17 0 1 0 16 26 a13 13 0 1 1 -16 -26 Z" />
      <g className="a-light">
        <circle cx="120" cy="18" r="1.6" />
        <circle cx="184" cy="56" r="1.4" />
        <circle cx="132" cy="44" r="1.2" />
      </g>
      <path className="a-ink a-line" d="M6 26 Q96 64 196 24" />
      <g>
        {[18, 40, 62, 84, 106, 128, 150, 172].map((x, i) => (
          <circle key={x} className={i % 2 ? 'a-sun' : 'a-acc'} cx={x} cy={30 + Math.sin((x / 200) * Math.PI) * 15} r="3.2" />
        ))}
      </g>
      <rect className="a-near" x="30" y="98" width="150" height="6" rx="3" />
      <g className="a-ink a-line">
        <path d="M84 70 H102 Q102 86 93 88 Q84 86 84 70 Z M93 88 V98 M86 98 H100" />
        <path d="M116 70 H134 Q134 86 125 88 Q116 86 116 70 Z M125 88 V98 M118 98 H132" />
      </g>
      <path className="a-acc" d="M85 77 H101 Q100 86 93 87 Q86 86 85 77 Z M117 78 H133 Q132 86 125 87 Q118 86 117 78 Z" />
    </>
  ),
  neutral: (
    <>
      {sun}
      <path className="a-far" d="M0 76 Q50 54 100 70 T200 64 V100 H0 Z" />
      <path className="a-mid" d="M0 94 Q70 78 130 92 T200 88 V120 H0 Z" />
      <path className="a-light a-line" d="M60 120 Q90 100 120 96" />
      <rect className="a-ink" x="146" y="70" width="4" height="16" />
      <circle className="a-near" cx="148" cy="64" r="11" />
    </>
  ),
};

export function Art({ kind, className = '' }: { kind: string | null; className?: string }) {
  if (!kind || !SCENES[kind]) return null;
  return (
    <svg className={`art ${className}`} viewBox="0 0 200 120" aria-hidden="true" focusable="false">
      {SCENES[kind]}
    </svg>
  );
}
