/**
 * All keyboard shortcuts of the TV in one place: the key handler in TvApp, the help overlay
 * and the Info page all read this list, so the documentation can't drift from the behaviour.
 */
export type KeyAction =
  | "dial"
  | "dialCommit"
  | "zapNext"
  | "zapPrev"
  | "lastChannel"
  | "dayPrev"
  | "dayNext"
  | "mute"
  | "fullscreen"
  | "teletext"
  | "help";

export interface KeyBinding {
  action: KeyAction;
  /** `KeyboardEvent.key` values (compared case-insensitively for letters). */
  keys: string[];
  /** How the keys are shown to people. */
  label: string;
  description: string;
}

export const KEYMAP: readonly KeyBinding[] = [
  {
    action: "dial",
    keys: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
    label: "1–9, 10…",
    description: "Sender wählen; zweistellig wie bei der Fernbedienung",
  },
  { action: "dialCommit", keys: ["Enter"], label: "Enter", description: "Gewählte Nummer sofort einschalten" },
  { action: "zapNext", keys: ["ArrowRight", "ArrowUp"], label: "→ / ↑", description: "Nächster Sender" },
  { action: "zapPrev", keys: ["ArrowLeft", "ArrowDown"], label: "← / ↓", description: "Vorheriger Sender" },
  { action: "lastChannel", keys: ["l"], label: "L", description: "Zurück zum zuletzt gesehenen Sender" },
  { action: "dayPrev", keys: ["PageUp"], label: "Bild↑", description: "Früherer Tag" },
  { action: "dayNext", keys: ["PageDown"], label: "Bild↓", description: "Späterer Tag" },
  { action: "mute", keys: ["m"], label: "M", description: "Ton an/aus" },
  { action: "fullscreen", keys: ["v"], label: "V", description: "Vollbild (oder Doppelklick aufs Bild); Esc beendet" },
  { action: "teletext", keys: ["t"], label: "T", description: "Videotext: Übersicht aller Sender (P300) ↔ eingestellter Sender" },
  { action: "help", keys: ["h", "?"], label: "H / ?", description: "Diese Übersicht" },
];

/** The action for a key press, or null. Letters match regardless of Shift/Caps Lock. */
export function actionForKey(key: string): KeyAction | null {
  const k = key.length === 1 ? key.toLowerCase() : key;
  return KEYMAP.find((b) => b.keys.includes(k))?.action ?? null;
}
