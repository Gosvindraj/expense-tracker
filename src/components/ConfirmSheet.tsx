/** Bottom-sheet replacement for window.confirm — styled, non-blocking. */
export default function ConfirmSheet({
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onClose,
}: {
  title: string;
  message?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal confirm-sheet" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {message && <p className="muted confirm-msg">{message}</p>}
        <div className="row">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="danger solid"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
