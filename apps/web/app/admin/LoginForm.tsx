"use client";

import { useActionState } from "react";
import { login } from "./auth-actions";

/** Without an answer by then (server restarted, connection lost), say so instead of waiting forever. */
const LOGIN_TIMEOUT_MS = 20_000;
const NO_ANSWER = "Keine Antwort vom Server. Bitte die Seite neu laden und noch einmal anmelden (mit einem neuen Code).";

export function LoginForm({ twoFactor, next = "/admin" }: { twoFactor: boolean; next?: string }) {
  const [state, action, pending] = useActionState(async (prev: { error?: string }, form: FormData) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<{ error: string }>((resolve) => {
      timer = setTimeout(() => resolve({ error: NO_ANSWER }), LOGIN_TIMEOUT_MS);
    });
    try {
      // A successful login redirects to the dashboard (the action's own navigation passes through).
      return await Promise.race([login(prev, form), timeout]);
    } catch (e) {
      // Network error or server gone: a message, not an endless „Wird angemeldet …".
      if (e instanceof TypeError) return { error: NO_ANSWER };
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }, {});
  return (
    <form action={action} className="contrib-form" style={{ maxWidth: 420 }}>
      <input type="hidden" name="next" value={next} />
      <label>
        Admin-Passwort
        <input type="password" name="password" required autoComplete="current-password" />
      </label>
      {twoFactor ? (
        <label>
          Code aus der Authenticator-App
          <input name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} />
        </label>
      ) : (
        <p className="admin-flag">Zwei-Faktor-Anmeldung ist noch nicht eingerichtet (ADMIN_TOTP_SECRET fehlt).</p>
      )}
      {state.error && <p className="contrib-errors">{state.error}</p>}
      <button className="play" disabled={pending}>
        {pending ? "Wird angemeldet …" : "Anmelden"}
      </button>
    </form>
  );
}
