import React from 'react';
import { createRoot } from 'react-dom/client';
import { isConfigured } from './firebase-config';
import './styles.css';

const root = createRoot(document.getElementById('root')!);

declare const __FAIR_DEMO__: boolean;

if (!isConfigured && !__FAIR_DEMO__) {
  root.render(
    <main>
      <div className="hero">
        <h1>Ausgleich.app</h1>
        <p>Fast fertig: Es fehlt noch die Verbindung zu deinem Firebase-Projekt.</p>
      </div>
      <p className="card">
        Trage die Werte deines neuen Firebase-Projekts in <code>src/firebase-config.ts</code> ein. Die Schritte stehen in der README.
      </p>
    </main>,
  );
} else {
  // Erst laden, wenn die Konfiguration da ist, sonst scheitert Firebase beim Start.
  import('./App').then(({ App }) =>
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    ),
  );
}
