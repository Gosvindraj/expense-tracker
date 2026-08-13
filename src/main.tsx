import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { ToastProvider } from "./components/Toast";
import "@fontsource-variable/inter/index.css";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // the request wrapper already bounds each attempt at 12s; three retries on
      // top of that meant a dead network took ~40s to surface as an error
      retry: 1,
      retryDelay: 800,
      // single-user app: data only changes when this client changes it, and
      // every mutation invalidates explicitly. No need to refetch on every
      // window focus.
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 0 },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
