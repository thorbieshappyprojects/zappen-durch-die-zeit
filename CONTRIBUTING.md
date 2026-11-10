# Mitmachen

Danke, dass du helfen möchtest! Es gibt zwei Wege.

## Inhalte: Videos, Programme, Hinweise

Am einfachsten über das Formular auf der Website: [zadudize.de/mitmachen](https://zadudize.de/mitmachen). Dort kannst du einen Link zu einer Aufnahme, das Programm eines Tages aus einer alten Fernsehzeitschrift (gern als Foto) oder eine Korrektur schicken. Alles wird vor der Veröffentlichung von Hand geprüft. Bitte keine Videos oder Programmdaten als Pull Request – das Formular hält Herkunft und Prüfung fest.

Ein defektes oder falsches Video meldest du direkt im Fernseher mit „Video melden“.

### Regeln für Video-Links

- Ein passender Titel genügt nicht: Wer hat hochgeladen, und was ist das Video wirklich?
- Was im Fernsehen lief, wird verlinkt – unabhängig vom Thema (auch UFO-Sendungen). Geprüft wird nur, ob die Aufnahme echt ist und aus der richtigen Zeit stammt.
- Erotische Sendungen (und Ansagen oder Vorschauen dazu) verlinken wir vorerst nicht; sie kommen auf die Prüfseite der Moderation.
- Ausnahme: Ein rechter Kanal, der den Inhalt einordnet oder kommentiert und in den letzten fünf Jahren aktiv war, wird nicht verlinkt; solche Funde kommen ebenfalls auf die Prüfseite.
- Was nie gesendet wurde (Vorträge, Kundgebungen, Internet-Shows, Propaganda), wird nie verlinkt. Spam-Re-Uploads und Aufnahmen aus der falschen Zeit ebenfalls nicht.
- Technisch prüfen: YouTube per oEmbed; beim Internet Archive muss die Datei selbst abspielbar sein.
- Wir laden nie Videos herunter und hosten keine – gespeichert werden nur Links und Metadaten. Uploader nennen wir höchstens mit ihrem Kanalnamen, nie mit einer E-Mail-Adresse.

## Code

### Einrichten

Voraussetzungen: Node.js 22 (`.nvmrc`) und pnpm (Version aus `package.json`, z. B. über `corepack enable`).

```bash
pnpm install
pnpm db:setup      # Datenbank (lokales PGlite) anlegen und die Tage aus seed/ importieren
pnpm dev           # http://localhost:3000
```

Umgebungsvariablen stehen mit Zweck in `apps/web/.env.example` (Kopie als `apps/web/.env.local`).

### Prüfen vor dem Pull Request

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Die CI führt dieselben Schritte aus. Formatierung: `pnpm format` (Prettier) – bitte nur für die Dateien, die du ohnehin änderst, und nicht zusammen mit inhaltlichen Änderungen.

### Konventionen

- Texte auf der Website auf Deutsch; Code, Kommentare und Commit-Nachrichten auf Englisch.
- Zeiten immer Europe/Berlin; der Fernsehtag läuft von 06:00 bis 06:00 Uhr. Für Zeitrechnung die Helfer in `packages/core/src/time.ts` verwenden, nie eigene Datumsrechnung.
- Ein Commit, ein Thema; die Nachricht sagt, was sich ändert und warum.
- Architektur: `ARCHITECTURE.md`; Daten und Kuratierung: `docs/DATA.md`; weitere Hinweise für Mitwirkende (auch für KI-Werkzeuge) in `CLAUDE.md`.

### Nicht-kommerziell

„Zappen durch die Zeit“ ist ein privates, streng nicht-kommerzielles Projekt. Pull Requests mit Werbung, Analyse- oder Tracking-Diensten, Affiliate-Links, Spenden- oder Sponsoring-Knöpfen nehmen wir nicht an – auch nicht als Option. Ein `FUNDING.yml` gibt es bewusst nicht.

### Lizenz

Mit einem Beitrag zum Code stimmst du zu, dass er unter der AGPL-3.0 (`LICENSE`) veröffentlicht wird. Für Daten in `seed/` gilt `seed/README.md`.

## Verhalten

Es gilt unser [Verhaltenskodex](CODE_OF_CONDUCT.md).
