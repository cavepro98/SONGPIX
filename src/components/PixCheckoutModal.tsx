import { useEffect, useRef, useState } from "react";
import { X, Copy, Check, Loader2, QrCode } from "lucide-react";
import { toast } from "sonner";

type CreateResp = {
  paymentId: string;
  statusToken: string;
  qrCode: string;
  qrCodeBase64: string;
  expiresAt: string;
  amountCents: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  roomSlug: string;
  amountCents: number;
  payerName: string;
  // either existingItemId OR song
  existingItemId?: string;
  song?: { url: string; title: string; artist?: string; thumbnailUrl?: string };
  onApproved?: () => void;
};

function fmtCents(c: number) {
  return (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function PixCheckoutModal(props: Props) {
  const { open, onClose, roomSlug, amountCents, payerName, existingItemId, song, onApproved } =
    props;
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<CreateResp | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("pending");
  const [copied, setCopied] = useState(false);
  const [remaining, setRemaining] = useState<number>(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!open) {
      setResp(null);
      setError(null);
      setStatus("pending");
      setEmail("");
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!resp) return;
    const id = setInterval(() => {
      const left = Math.max(
        0,
        Math.floor((new Date(resp.expiresAt).getTime() - Date.now()) / 1000),
      );
      setRemaining(left);
    }, 500);
    return () => clearInterval(id);
  }, [resp]);

  useEffect(() => {
    if (!resp || status === "approved") return;
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(
          `/api/public/payments/${resp.paymentId}/status?token=${encodeURIComponent(resp.statusToken)}`,
        );
        if (!r.ok) return;
        const data = await r.json();
        setStatus(data.status);
        if (data.status === "approved") {
          if (pollRef.current) clearInterval(pollRef.current);
          toast.success("Pagamento confirmado! 🎉");
          onApproved?.();
          setTimeout(() => onClose(), 1500);
        }
      } catch {
        /* keep polling */
      }
    }, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [resp, status, onApproved, onClose]);

  async function start() {
    setError(null);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Informe um e-mail válido");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/public/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomSlug,
          payerName,
          payerEmail: email,
          amountCents,
          existingItemId,
          song,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? "Erro ao gerar PIX");
      setResp(data as CreateResp);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!resp?.qrCode) return;
    try {
      await navigator.clipboard.writeText(resp.qrCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  if (!open) return null;

  const mm = Math.floor(remaining / 60)
    .toString()
    .padStart(2, "0");
  const ss = (remaining % 60).toString().padStart(2, "0");
  const expired = resp && remaining === 0 && status !== "approved";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-neon" />
            <h3 className="font-display text-lg font-bold">Boost via PIX</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 text-sm text-muted-foreground">
          Valor: <span className="font-bold text-foreground">{fmtCents(amountCents)}</span>
        </p>

        {!resp ? (
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Seu e-mail (para o comprovante)
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@email.com"
                className="mt-1 w-full rounded-md border border-input bg-surface-2 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neon"
              />
            </label>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <button
              onClick={start}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-neon px-4 py-3 text-sm font-bold uppercase tracking-widest text-neon-foreground disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <QrCode className="h-4 w-4" />
              )}
              Gerar QR code PIX
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {status === "approved" ? (
              <div className="rounded-md border border-neon bg-neon/10 p-4 text-center">
                <Check className="mx-auto h-8 w-8 text-neon" />
                <p className="mt-2 font-bold text-neon">Pagamento confirmado!</p>
              </div>
            ) : (
              <>
                {resp.qrCodeBase64 && (
                  <div className="rounded-md bg-white p-3">
                    <img
                      src={`data:image/png;base64,${resp.qrCodeBase64}`}
                      alt="QR Code PIX"
                      className="mx-auto block h-56 w-56"
                    />
                  </div>
                )}
                <button
                  onClick={copy}
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs font-bold uppercase tracking-widest text-foreground hover:bg-surface"
                >
                  {copied ? <Check className="h-3 w-3 text-neon" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Copiado!" : "Copiar PIX copia e cola"}
                </button>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{expired ? "QR expirado" : `Expira em ${mm}:${ss}`}</span>
                  <span className="flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> aguardando pagamento…
                  </span>
                </div>
                <p className="text-center text-[10px] text-muted-foreground">
                  Assim que o banco confirmar, sua música sobe na fila automaticamente.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
