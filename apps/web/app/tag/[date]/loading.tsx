/** While a day loads: the page frame and a short note. Fades in late, so fast navigation doesn't flash. */
export default function Loading() {
  return (
    <div className="wrap">
      <header className="page-header">
        <h1>Zappen durch die Zeit</h1>
      </header>
      <p className="tuning" role="status">
        Sender wird eingestellt …
      </p>
    </div>
  );
}
