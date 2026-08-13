export type TabName = "stats" | "list" | "add" | "plan" | "import";
export type DataSegment = "backups" | "import" | "categories";

type Target = { tab: TabName; segment?: DataSegment };

const listeners = new Set<(t: Target) => void>();

/**
 * Cross-screen navigation without threading callbacks through every component.
 *
 * Needed because the category picker — a leaf component rendered from four
 * different screens — wants to offer "Manage categories", and prop-drilling a
 * nav handler to all of them would touch far more code than the feature.
 */
export function navigate(tab: TabName, segment?: DataSegment) {
  for (const l of listeners) l({ tab, segment });
}

export function onNavigate(fn: (t: Target) => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
