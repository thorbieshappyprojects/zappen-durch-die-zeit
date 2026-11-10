"use client";

import { useEffect, useState } from "react";

/**
 * Submit button for destructive admin actions: the first click only asks „Wirklich?", the second
 * (within a few seconds) submits. No browser confirm() dialog.
 */
export function ConfirmButton({ children, className = "btn", name, value }: { children: React.ReactNode; className?: string; name?: string; value?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="submit"
      name={name}
      value={value}
      className={`${className}${armed ? " confirm-armed" : ""}`}
      onClick={(e) => {
        if (!armed) {
          e.preventDefault();
          setArmed(true);
        }
      }}
    >
      {armed ? "Wirklich?" : children}
    </button>
  );
}
