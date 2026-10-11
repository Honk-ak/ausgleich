# Ausgleich.app – gemeinsam ausgeben, fair ausgleichen

Gemeinsam erleben. Nebenbei erfassen. Am Ende fair ausgleichen.

Web-App (PWA) mit React, Firebase (anonyme Anmeldung + Firestore) und GitHub Pages.

## Strikte Trennung von deinem anderen Projekt

Dieses Projekt enthält keine Verbindung zu irgendeinem bestehenden Projekt. Damit das so bleibt:

1. **Eigener Ordner.** Entpacke das Projekt in einen neuen, leeren Ordner. Nicht in den Ordner der anderen App.
2. **Eigenes Firebase-Projekt.** Lege in der Firebase-Konsole ein NEUES Projekt an. Füge „Fair“ nicht als weitere App zum bestehenden Projekt hinzu, sonst teilen sich beide Apps Datenbank, Nutzer und Regeln.
3. **Eigenes GitHub-Repository.** Neues Repository, keine gemeinsamen Branches, kein Unterordner im alten.
4. **Regeln nur in der Konsole des neuen Projekts einfügen** (Schritt 2.4). Wenn du stattdessen die Firebase-Befehlszeile nutzt, prüfe vorher mit `firebase use`, dass das neue Projekt aktiv ist. Ein `firebase deploy` im falschen Projekt würde dort die Regeln überschreiben.

Technisch sind die beiden Apps auch im Browser getrennt, obwohl beide unter `deinname.github.io` liegen: Firebase speichert Anmeldung und Offline-Daten je Firebase-Projekt, die App-Installation gilt je Repository-Pfad, und die wenigen lokalen Einstellungen tragen das Präfix `fair.`.

## 1. Ausprobieren ohne Firebase (2 Minuten)

Voraussetzung: Node.js 20 oder neuer.

```
npm install
npm run demo
```

Öffne die angezeigte Adresse. Der Demo-Modus hält die Daten nur im Arbeitsspeicher, ohne Synchronisation.

## 2. Firebase einrichten

1. https://console.firebase.google.com → **Projekt hinzufügen** → Name z. B. `ausgleich-app`. Google Analytics: aus.
2. **Build → Authentication → Los geht's → Anmeldemethode → Anonym → aktivieren.**
3. **Build → Firestore Database → Datenbank erstellen** → Standort `eur3 (europe-west)` → im Produktionsmodus starten.
4. **Firestore → Regeln:** Inhalt der Datei `firestore.rules` vollständig einfügen → **Veröffentlichen**.
5. **Projekteinstellungen (Zahnrad) → Allgemein → Meine Apps → Web-App (`</>`) hinzufügen** → Name `Ausgleich.app`, ohne Hosting.
6. Die angezeigten Werte (`apiKey`, `authDomain`, `projectId`, …) in `src/firebase-config.ts` eintragen.

Der Gratis-Tarif (Spark) reicht. Es werden keine Cloud Functions gebraucht.

Lokal testen:

```
npm run dev
```

## 3. Auf GitHub Pages veröffentlichen

1. Neues Repository auf GitHub anlegen (z. B. `ausgleich`).
2. Im Projektordner:
   ```
   git init
   git add .
   git commit -m "Ausgleich.app MVP"
   git branch -M main
   git remote add origin https://github.com/DEINNAME/ausgleich.git
   git push -u origin main
   ```
3. Im Repository: **Settings → Pages → Source: GitHub Actions**.
4. Unter **Actions** läuft „Veröffentlichen“. Danach ist die App unter `https://DEINNAME.github.io/ausgleich/` erreichbar.

Auf dem Handy: Seite öffnen → „Zum Home-Bildschirm hinzufügen“.

## Tests

```
npm test            # Rechenkern: Salden, Rundung, minimale Zahlungen, SEPA-QR, IBAN
npm run test:rules  # Zugriffsregeln gegen den Firestore-Emulator (braucht Java)
```

## Aufbau

| Pfad | Inhalt |
| --- | --- |
| `src/core/settle.ts` | Ausgleich: Anteile, Salden, Toleranz, möglichst wenige Zahlungen, faire Rundung |
| `src/core/pay.ts` | SEPA-QR-Text (EPC069-12, Version 002), IBAN-Prüfung, PayPal.Me-Link |
| `src/store.ts` | Firebase: Anmeldung, Lesen und Schreiben, Offline-Speicher |
| `src/store.demo.ts` | Ersatz für den Demo-Modus |
| `src/screens/` | Start, Wizard, Beitreten, Aktivität, Details, Ausgleich, Zahlung |
| `firestore.rules` | Zugriffsregeln: nur Mitglieder einer Aktivität |
| `tests/rules.test.ts` | Tests der Zugriffsregeln |

## Was diese Version kann

- Aktivität in fünf Fragen anlegen, mit optionalem **Anlass** (z. B. „Schiffsausflug“)
- **Archiv** mit Suche (Name, Anlass, Personen) und Filter nach Jahr, Monat, Tag und Stand
- **Beitritt nur mit Zustimmung aller**, die die App in dieser Aktivität schon nutzen. Auch Personen ohne App kommen nur mit Zustimmung aller dazu. Wer später dazukommt, wird an früheren Ausgaben nicht beteiligt.
- Jede Aktivität sehen nur ihre Mitglieder. Eine frühere gemeinsame Aktivität gibt keinen Zugriff auf spätere.
- Ausgaben erfassen („für alle“, „geht auf mich“, Anteile); auf jedem Gerät ist „Ich“ als Zahler vorausgewählt
- **Mitlernende Vorschläge** für „Wofür?“ (10 Knöpfe): zuerst Begriffe dieser Aktivität, dann passend zum Anlass (z. B. Schiff → Schiffsticket, Bordrestaurant), dann eigene Lieblingsbegriffe, dann Grundbegriffe; beim Tippen wird gefiltert
- **12 Stunden** lang frei korrigierbar; danach und nach dem Ausgleich nur mit **Begründung**, die alle im Verlauf und im Druck sehen
- Ausgleich mit möglichst wenigen Zahlungen und Rundungsprotokoll
- **Zahlungen zweistufig:** Der Zahler meldet „überwiesen“ oder „bar gegeben“, **nur der Empfänger** bestätigt „erhalten“. Ohne Bestätigung abschließen geht nur mit Begründung; beide sehen einen Hinweis.
- **Nachausgleich:** Korrekturen nach dem Ausgleich verändern erledigte Zahlungen nicht; die Differenz wird zusätzlich verrechnet.
- **Erinnerungen** beim Öffnen der App: freundlicher Hinweis zum Zahlen bzw. Bestätigen (Frist einstellbar, Standard 3 Tage) und zu offenen Beitrittsanfragen
- **Bezahlen mit nur einem Handy:** Empfänger, IBAN, Betrag und Zweck einzeln kopieren; „Als Bild speichern“ legt QR-Code und Angaben als Bild ab (zum Hochladen bei „Fotoüberweisung“). Am Computer steht der QR-Code oben.
- SEPA-QR-Code, Überweisungsdaten, **PayPal**: Knopf öffnet die PayPal-App mit Betrag, zusätzlich QR-Code mit demselben Link
- **Druckansicht** mit allen Ausgaben, Rechenweg, Zahlungen und Änderungsprotokoll; über den Druckdialog als PDF speicherbar
- Demo-Modus mit Leiste „Ansicht als …“ oben auf jeder Seite, um auszuprobieren, was andere Personen sehen

Noch nicht enthalten: Push-Nachrichten bei geschlossener App, Spracheingabe, Kamera, Einzelpositionen, gespeicherte Gruppen, Konto per E-Mail, Fremdwährungen.

Bekannte Grenzen:

- Wer die Browserdaten löscht oder das Handy wechselt, bekommt eine neue anonyme Kennung und muss den Beitritt neu anfragen. Seinen alten Namen kann er dann nicht wieder übernehmen; das verhindert, dass jemand fremde Namen übernimmt. Abhilfe kommt mit dem optionalen E-Mail-Konto.
- Die App erfährt nicht von Bank oder PayPal, ob gezahlt wurde; dafür gibt es die Bestätigung durch den Empfänger.
- IBAN und PayPal-Name sind für alle Mitglieder der Aktivität lesbar und nicht zusätzlich verschlüsselt.
- Der Ausgleich wird auf den Geräten berechnet, nicht auf einem Server nachgerechnet. Jede Zahlung und Änderung ist aber für alle sichtbar.
