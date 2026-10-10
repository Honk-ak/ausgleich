import { useEffect, useState } from 'react';
import { ActivityScreen } from './screens/Activity';
import { Home, Join, Wizard } from './screens/Start';
import { useUid } from './store';

function useRoute(): string[] {
  const read = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [parts, setParts] = useState(read);
  useEffect(() => {
    const on = () => {
      setParts(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return parts;
}

export function App() {
  const { uid, error } = useUid();
  const route = useRoute();
  if (error)
    return (
      <main>
        <p className="card">
          Die Anmeldung hat nicht geklappt ({error}). Ist in der Firebase-Konsole unter „Authentication“ die Methode „Anonym“ aktiviert?
        </p>
      </main>
    );
  if (!uid)
    return (
      <main>
        <p className="muted center">Lädt …</p>
      </main>
    );
  if (route[0] === 'new') return <Wizard uid={uid} />;
  if (route[0] === 'join' && route[1] && route[2]) return <Join uid={uid} aid={route[1]} token={route[2]} />;
  if (route[0] === 'a' && route[1]) return <ActivityScreen key={route[1]} uid={uid} aid={route[1]} view={route[2] ?? ''} />;
  return <Home uid={uid} />;
}
