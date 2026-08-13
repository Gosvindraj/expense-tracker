import { useSyncExternalStore } from "react";

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/**
 * Browser connectivity, as far as it can be known.
 *
 * `navigator.onLine` only reports whether an interface is up — it stays true on
 * a captive portal, a dead router, or one bar of signal. So a false here is a
 * reliable "definitely offline", but a true is not a promise of reachability.
 * That's why the request timeout in `api()` exists as well: this hook prevents
 * the obvious case, the timeout catches the rest.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true, // assume reachable during SSR/first paint
  );
}
