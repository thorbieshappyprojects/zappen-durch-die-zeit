import { adminConfigured, isAdmin, twoFactorEnabled } from "@/lib/admin-auth";
import { LoginForm } from "./LoginForm";

/** Renders the login (or a setup hint) instead of `children` when not signed in as admin. */
export async function AdminGate({ title, next, children }: { title: string; next: string; children: React.ReactNode }) {
  if (await isAdmin()) return <>{children}</>;
  return (
    <div className="wrap contrib">
      <h1>{title}</h1>
      {adminConfigured() ? (
        <LoginForm twoFactor={twoFactorEnabled()} next={next} />
      ) : (
        <p>Die Moderation ist nicht eingerichtet. Setze ADMIN_TOKEN (und für 2FA ADMIN_TOTP_SECRET) und starte den Server neu.</p>
      )}
    </div>
  );
}
