// Firebase-Projekt „ausgleich-app“ (nur für Ausgleich.app, nicht für andere Projekte verwenden).
// Diese Werte sind keine Geheimnisse; sie dürfen im Repository stehen.
// Der Schutz der Daten kommt aus den Regeln in firestore.rules.
export const firebaseConfig = {
  apiKey: 'AIzaSyA5wx5juJ1Ksvk3z-B_HQ936vbEHza4qdQ',
  authDomain: 'ausgleich-app.firebaseapp.com',
  projectId: 'ausgleich-app',
  storageBucket: 'ausgleich-app.firebasestorage.app',
  messagingSenderId: '545036980104',
  appId: '1:545036980104:web:fd420d47e5b8ab09c1743d',
};

export const isConfigured = firebaseConfig.projectId !== 'HIER_EINTRAGEN';