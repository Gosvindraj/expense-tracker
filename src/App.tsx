import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Account, AccountCreate } from "../shared/schemas";
import { formatMinor, parseToMinor } from "../shared/money";

async function fetchAccounts(): Promise<Account[]> {
  const res = await fetch("/api/accounts");
  if (!res.ok) throw new Error(`GET /api/accounts failed: ${res.status}`);
  return res.json();
}

async function createAccount(input: AccountCreate): Promise<Account> {
  const res = await fetch("/api/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`POST /api/accounts failed: ${res.status}`);
  return res.json();
}

export default function App() {
  const queryClient = useQueryClient();
  const accountsQuery = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts });

  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: createAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setName("");
      setBalance("");
      setFormError(null);
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const startingBalanceMinor = balance.trim() === "" ? 0 : parseToMinor(balance);
    if (startingBalanceMinor === null) {
      setFormError("Balance must be a number like 123.45");
      return;
    }
    if (!name.trim()) {
      setFormError("Name is required");
      return;
    }
    createMutation.mutate({
      name: name.trim(),
      icon: "💰",
      color: "#4f6df5",
      startingBalanceMinor,
    });
  }

  return (
    <main>
      <h1>Expense Tracker</h1>
      <p className="subtitle">Phase 1 walking skeleton — accounts</p>

      <form onSubmit={onSubmit}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Account name (e.g. Cash)"
          maxLength={60}
        />
        <input
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          placeholder="Starting balance (optional)"
          inputMode="decimal"
        />
        <button type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? "Adding…" : "Add account"}
        </button>
      </form>
      {formError && <p className="error">{formError}</p>}
      {createMutation.isError && <p className="error">{createMutation.error.message}</p>}

      {accountsQuery.isLoading && <p>Loading…</p>}
      {accountsQuery.isError && <p className="error">{accountsQuery.error.message}</p>}

      <ul className="accounts">
        {accountsQuery.data?.map((a) => (
          <li key={a.id}>
            <span className="icon" style={{ background: a.color }}>
              {a.icon}
            </span>
            <span className="name">{a.name}</span>
            <span className="balance">{formatMinor(a.startingBalanceMinor)}</span>
          </li>
        ))}
        {accountsQuery.data?.length === 0 && <li className="empty">No accounts yet.</li>}
      </ul>
    </main>
  );
}
