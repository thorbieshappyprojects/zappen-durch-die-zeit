"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/admin-action";

/** A form for an admin action (lib/admin-action `guarded`): its error appears inline, in German. */
export function AdminForm({
  action,
  className,
  children,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  className?: string;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className={className} aria-busy={pending}>
      {children}
      {state.error && (
        <span className="admin-error" role="alert">
          {state.error}
        </span>
      )}
    </form>
  );
}
