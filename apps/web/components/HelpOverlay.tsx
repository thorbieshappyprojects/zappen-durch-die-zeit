"use client";

import { useRef } from "react";
import { KEYMAP } from "@/lib/keymap";
import { useDialog } from "@/lib/use-dialog";

/** All shortcuts (from the shared keymap), opened with H / ? or the "?" button. */
export function HelpOverlay({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialog(dialogRef, { open: true, onClose, initialFocus: () => closeRef.current });
  return (
    <div className="help-backdrop" onClick={onClose}>
      <div ref={dialogRef} className="help" role="dialog" aria-modal="true" aria-label="Tastenkürzel" onClick={(e) => e.stopPropagation()}>
        <header>
          <strong>Fernbedienung</strong>
          <button ref={closeRef} className="btn" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </header>
        <KeyTable />
        <p className="help-touch">Am Handy: auf dem Bild nach links/rechts wischen zum Umschalten.</p>
      </div>
    </div>
  );
}

export function KeyTable() {
  return (
    <table className="info-keys">
      <tbody>
        {KEYMAP.map((b) => (
          <tr key={b.action}>
            <td>
              <code>{b.label}</code>
            </td>
            <td>{b.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
