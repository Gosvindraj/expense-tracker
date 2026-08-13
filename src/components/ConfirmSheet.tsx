import { useState, type ReactNode } from "react";
import Sheet from "./Sheet";
import ErrorNote from "./ErrorNote";

/**
 * Bottom-sheet replacement for window.confirm — styled, non-blocking.
 *
 * The sheet does NOT close itself on confirm: it stays up while the mutation
 * runs and surfaces any failure in place. Closing first used to drop errors
 * ("category still has expenses") onto a screen the user had already left.
 * Callers close it from their mutation's onSuccess.
 *
 * `confirmPhrase` raises the friction to match the blast radius. Deleting one
 * expense has an undo window; deleting 1,500 needs more than a tap in the same
 * place the Cancel button used to be.
 */
export default function ConfirmSheet({
  title,
  message,
  details,
  confirmLabel = "Delete",
  confirmPhrase,
  pending = false,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  message?: string;
  /** Itemised statement of what's destroyed — shown in a high-contrast block. */
  details?: ReactNode;
  confirmLabel?: string;
  /** When set, the user must type this exact string to enable the action. */
  confirmPhrase?: string;
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const locked = confirmPhrase !== undefined && typed.trim() !== confirmPhrase;

  return (
    <Sheet title={title} className={`confirm-sheet ${confirmPhrase ? "high-risk" : ""}`} onClose={onClose}>
      <h3>{title}</h3>
      {message && <p className="muted confirm-msg">{message}</p>}
      {details && <div className="confirm-details">{details}</div>}
      {confirmPhrase !== undefined && (
        <label className="confirm-phrase">
          Type <strong>{confirmPhrase}</strong> to confirm
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-label={`Type ${confirmPhrase} to confirm`}
          />
        </label>
      )}
      <ErrorNote error={error} />
      <div className="row">
        <button type="button" className="quiet" onClick={onClose} disabled={pending}>
          Cancel
        </button>
        <button
          type="button"
          className="danger solid"
          onClick={onConfirm}
          disabled={pending || locked}
        >
          {pending ? "Working…" : confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}
