/**
 * One error presentation for the whole app.
 *
 * Errors used to be a bare `<p className="error">` dropped wherever the author
 * happened to be in the JSX — same colour, different weight, placement and
 * wording each time. This gives them a consistent shape and an optional retry.
 */
export default function ErrorNote({
  error,
  onRetry,
}: {
  error: string | Error | null | undefined;
  onRetry?: () => void;
}) {
  if (!error) return null;
  const message = typeof error === "string" ? error : error.message;
  return (
    <div className="error-note" role="alert">
      <span className="error-note-icon" aria-hidden="true">
        !
      </span>
      <span className="error-note-msg">{message}</span>
      {onRetry && (
        <button type="button" className="error-note-retry" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
