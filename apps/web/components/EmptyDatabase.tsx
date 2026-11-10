export function EmptyDatabase() {
  return (
    <div className="wrap">
      <header className="page-header">
        <h1>Zappen durch die Zeit</h1>
      </header>
      <p>
        Die Datenbank ist noch leer. Zum Einrichten im Projektordner <code>pnpm db:setup</code> ausführen (bei laufendem{" "}
        <code>pnpm dev</code> vorher beenden) und die Seite neu laden.
      </p>
    </div>
  );
}
