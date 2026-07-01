import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Wallet, Send, X, Banknote, KeyRound } from "lucide-react";
import { AppShell } from "@/components/AppShell";

import {
  getMyEarnings,
  requestWithdrawal,
  cancelWithdrawal,
  validatePixKey,
} from "@/lib/withdrawals.functions";

export const Route = createFileRoute("/_authenticated/withdrawals")({
  head: () => ({ meta: [{ title: "Saques | SongPIX" }] }),
  component: WithdrawalsPage,
});

type Withdrawal = {
  id: string;
  amount_cents: number;
  method: "pix" | "bank";
  pix_key_type: string | null;
  pix_key: string | null;
  bank_name: string | null;
  bank_agency: string | null;
  bank_account: string | null;
  bank_account_type: string | null;
  bank_holder_name: string | null;
  bank_holder_doc: string | null;
  status: "pending" | "approved" | "rejected" | "paid";
  admin_notes: string | null;
  created_at: string;
  processed_at: string | null;
};

function formatCents(c: number) {
  return (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending: { label: "pendente", cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  approved: { label: "aprovado", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  paid: { label: "pago", cls: "bg-neon/15 text-neon border-neon/30" },
  rejected: { label: "rejeitado", cls: "bg-destructive/15 text-destructive border-destructive/30" },
};

function WithdrawalsPage() {
  const fetchEarnings = useServerFn(getMyEarnings);
  const create = useServerFn(requestWithdrawal);
  const cancel = useServerFn(cancelWithdrawal);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Awaited<ReturnType<typeof getMyEarnings>> | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // form
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"pix" | "bank">("pix");
  const [pixType, setPixType] = useState<"email" | "cpf" | "phone" | "random">("email");
  const [pixKey, setPixKey] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAgency, setBankAgency] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankAccountType, setBankAccountType] = useState<"corrente" | "poupanca">("corrente");
  const [bankHolderName, setBankHolderName] = useState("");
  const [bankHolderDoc, setBankHolderDoc] = useState("");

  async function load() {
    setLoading(true);
    try {
      const d = await fetchEarnings();
      setData(d);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const available = data?.availableCents ?? 0;
  const minWithdrawal = data?.minWithdrawalCents ?? 500;

  const pixError = useMemo(
    () => (method === "pix" && pixKey ? validatePixKey(pixType, pixKey) : null),
    [method, pixType, pixKey],
  );

  function resetForm() {
    setAmount("");
    setPixKey("");
    setBankName("");
    setBankAgency("");
    setBankAccount("");
    setBankHolderName("");
    setBankHolderDoc("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cents = Math.round(parseFloat(amount.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents <= 0) return toast.error("Valor inválido");
    if (cents > available) return toast.error("Valor maior que o saldo disponível");
    if (cents < minWithdrawal) return toast.error(`Valor mínimo: ${formatCents(minWithdrawal)}`);

    setSubmitting(true);
    try {
      await create({
        data: {
          amountCents: cents,
          method,
          ...(method === "pix"
            ? { pixKeyType: pixType, pixKey }
            : {
                bankName,
                bankAgency,
                bankAccount,
                bankAccountType,
                bankHolderName,
                bankHolderDoc,
              }),
        },
      });
      toast.success("Saque solicitado");
      setOpen(false);
      resetForm();
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(id: string) {
    if (!confirm("Cancelar este saque?")) return;
    try {
      await cancel({ data: { id } });
      toast.success("Saque cancelado");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  return (
    <AppShell active="withdrawals">
      <header className="mb-6 flex flex-col gap-1 border-b border-border pb-6">
        <span className="block font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground">
          Painel · Financeiro
        </span>
        <h1 className="font-display text-2xl font-bold italic uppercase leading-none tracking-tighter sm:text-5xl">
          Saques
        </h1>
        <p className="max-w-xl pt-2 text-sm text-muted-foreground">
          Solicite o resgate do seu saldo via PIX ou conta bancária.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-mono uppercase tracking-widest">
          <span className="rounded-full border border-neon/40 bg-neon/10 px-3 py-1 text-neon">
            Mínimo: {formatCents(minWithdrawal)}
          </span>
          <span className="rounded-full border border-border bg-surface px-3 py-1 text-muted-foreground">
            ⏱ Cai em até 1 hora após aprovação
          </span>
        </div>
      </header>

      <div>
        {/* Balance cards */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Total bruto
            </p>
            <p className="mt-2 font-display text-2xl font-bold tabular-nums">
              {formatCents(data?.grossCents ?? 0)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Comissão da plataforma: {((data?.commission ?? 0) * 100).toFixed(0)}%
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Em processo
            </p>
            <p className="mt-2 font-display text-2xl font-bold tabular-nums text-yellow-400">
              {formatCents(data?.processingCents ?? 0)}
            </p>
            <div className="mt-1 space-y-1 text-xs text-muted-foreground">
              <p>Saques pendentes ou aprovados</p>
              <p>
                Já sacado:{" "}
                <span className="font-bold text-foreground">
                  {formatCents(data?.paidOutCents ?? 0)}
                </span>
              </p>
            </div>
          </div>
          <div className="rounded-xl border-2 border-neon bg-neon p-4 text-neon-foreground">
            <p className="text-[10px] font-mono uppercase tracking-widest text-neon-foreground/70">
              Disponível
            </p>
            <p className="mt-2 font-display text-4xl font-bold italic uppercase tabular-nums leading-none tracking-tighter text-neon-foreground">
              {formatCents(available)}
            </p>

            <button
              onClick={() => setOpen(true)}
              disabled={available < minWithdrawal}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-neon-foreground px-3 py-2 text-xs font-bold uppercase tracking-widest text-neon disabled:opacity-40"
            >
              <Wallet className="h-4 w-4" /> Solicitar saque
            </button>
          </div>
        </div>

        {/* History */}
        <section className="mt-8">
          <h2 className="mb-3 font-display text-lg font-bold">Histórico de saques</h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : !data?.withdrawals?.length ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Nenhum saque solicitado ainda.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3">Valor</th>
                    <th className="px-4 py-3">Método</th>
                    <th className="px-4 py-3">Destino</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.withdrawals as Withdrawal[]).map((w) => {
                    const st = STATUS_LABEL[w.status];
                    return (
                      <tr key={w.id} className="border-t border-border">
                        <td className="px-4 py-3 text-muted-foreground">
                          {new Date(w.created_at).toLocaleString("pt-BR")}
                        </td>
                        <td className="px-4 py-3 font-bold tabular-nums">
                          {formatCents(w.amount_cents)}
                        </td>
                        <td className="px-4 py-3">{w.method === "pix" ? "PIX" : "Banco"}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {w.method === "pix"
                            ? `${w.pix_key_type}: ${w.pix_key}`
                            : `${w.bank_name} · Ag ${w.bank_agency} · Cc ${w.bank_account}`}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${st.cls}`}
                          >
                            {st.label}
                          </span>
                          {w.admin_notes && (
                            <p className="mt-1 text-[10px] text-muted-foreground">
                              {w.admin_notes}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {w.status === "pending" && (
                            <button
                              onClick={() => handleCancel(w.id)}
                              className="text-xs text-destructive hover:underline"
                            >
                              cancelar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-lg rounded-xl border border-border bg-surface p-6"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">Solicitar saque</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Valor (disponível: {formatCents(available)})
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                className="mt-1 w-full rounded-md border border-input bg-surface-2 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-neon"
                required
              />
            </label>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMethod("pix")}
                className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-bold ${method === "pix" ? "border-neon bg-neon text-neon-foreground" : "border-border bg-surface-2 text-muted-foreground"}`}
              >
                <KeyRound className="h-4 w-4" /> PIX
              </button>
              <button
                type="button"
                onClick={() => setMethod("bank")}
                className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-bold ${method === "bank" ? "border-neon bg-neon text-neon-foreground" : "border-border bg-surface-2 text-muted-foreground"}`}
              >
                <Banknote className="h-4 w-4" /> Banco
              </button>
            </div>

            {method === "pix" ? (
              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Tipo de chave
                  </span>
                  <select
                    value={pixType}
                    onChange={(e) => setPixType(e.target.value as any)}
                    className="mt-1 w-full rounded-md border border-input bg-surface-2 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neon"
                  >
                    <option value="email">E-mail</option>
                    <option value="cpf">CPF</option>
                    <option value="phone">Telefone</option>
                    <option value="random">Aleatória (UUID)</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Chave PIX
                  </span>
                  <input
                    type="text"
                    value={pixKey}
                    onChange={(e) => setPixKey(e.target.value)}
                    placeholder={
                      pixType === "email"
                        ? "voce@email.com"
                        : pixType === "cpf"
                          ? "00000000000"
                          : pixType === "phone"
                            ? "+5511999999999"
                            : "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    }
                    className="mt-1 w-full rounded-md border border-input bg-surface-2 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neon"
                    required
                  />
                  {pixError && (
                    <span className="mt-1 block text-xs text-destructive">{pixError}</span>
                  )}
                </label>
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <label className="col-span-2 block">
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Banco
                  </span>
                  <input
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    required
                    className="mt-1 w-full rounded-md border border-input bg-surface-2 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Agência
                  </span>
                  <input
                    value={bankAgency}
                    onChange={(e) => setBankAgency(e.target.value)}
                    required
                    className="mt-1 w-full rounded-md border border-input bg-surface-2 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Conta
                  </span>
                  <input
                    value={bankAccount}
                    onChange={(e) => setBankAccount(e.target.value)}
                    required
                    className="mt-1 w-full rounded-md border border-input bg-surface-2 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Tipo
                  </span>
                  <select
                    value={bankAccountType}
                    onChange={(e) => setBankAccountType(e.target.value as any)}
                    className="mt-1 w-full rounded-md border border-input bg-surface-2 px-3 py-2 text-sm"
                  >
                    <option value="corrente">Corrente</option>
                    <option value="poupanca">Poupança</option>
                  </select>
                </label>
                <label className="col-span-2 block">
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Titular
                  </span>
                  <input
                    value={bankHolderName}
                    onChange={(e) => setBankHolderName(e.target.value)}
                    required
                    className="mt-1 w-full rounded-md border border-input bg-surface-2 px-3 py-2 text-sm"
                  />
                </label>
                <label className="col-span-2 block">
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    CPF/CNPJ do titular
                  </span>
                  <input
                    value={bankHolderDoc}
                    onChange={(e) => setBankHolderDoc(e.target.value)}
                    required
                    className="mt-1 w-full rounded-md border border-input bg-surface-2 px-3 py-2 text-sm"
                  />
                </label>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting || !!pixError}
                className="flex items-center gap-2 rounded-md bg-neon px-4 py-2 text-sm font-bold uppercase tracking-widest text-neon-foreground disabled:opacity-40"
              >
                <Send className="h-4 w-4" /> {submitting ? "Enviando..." : "Confirmar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
