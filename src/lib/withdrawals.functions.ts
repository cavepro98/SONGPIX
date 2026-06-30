import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PIX_TYPES = ["email", "cpf", "phone", "random"] as const;

function onlyDigits(s: string) {
  return s.replace(/\D/g, "");
}

export function validatePixKey(type: string, key: string): string | null {
  const k = key.trim();
  if (!k) return "Chave PIX vazia";
  if (type === "email") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(k)) return "E-mail inválido";
    return null;
  }
  if (type === "cpf") {
    const d = onlyDigits(k);
    if (d.length !== 11) return "CPF deve ter 11 dígitos";
    return null;
  }
  if (type === "phone") {
    const d = onlyDigits(k);
    if (d.length < 10 || d.length > 13) return "Telefone inválido";
    return null;
  }
  if (type === "random") {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k))
      return "Chave aleatória deve ser UUID";
    return null;
  }
  return "Tipo de chave inválido";
}

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apenas administradores");
}

async function computeUserBalance(supabaseAdmin: any, userId: string) {
  const { data: settings } = await supabaseAdmin
    .from("platform_settings")
    .select("commission_rate, min_withdrawal_cents")
    .eq("id", 1)
    .maybeSingle();
  const commission = Number(settings?.commission_rate ?? 0.1);
  const minWithdrawalCents = Number(settings?.min_withdrawal_cents ?? 500);

  // Totals are maintained transactionally by confirm_payment on the rooms table.
  const { data: rooms } = await supabaseAdmin
    .from("rooms")
    .select("total_gross_cents, total_net_cents, total_commission_cents")
    .eq("owner_id", userId);
  const grossCents = (rooms ?? []).reduce(
    (s: number, r: any) => s + Number(r.total_gross_cents || 0),
    0,
  );
  const netCents = (rooms ?? []).reduce(
    (s: number, r: any) => s + Number(r.total_net_cents || 0),
    0,
  );
  const commissionCents = (rooms ?? []).reduce(
    (s: number, r: any) => s + Number(r.total_commission_cents || 0),
    0,
  );

  const { data: ws } = await supabaseAdmin
    .from("withdrawals")
    .select("amount_cents, status")
    .eq("user_id", userId)
    .in("status", ["pending", "approved", "paid"]);
  const lockedCents = (ws ?? []).reduce((s: number, w: any) => s + w.amount_cents, 0);

  return {
    grossCents,
    commission,
    commissionCents,
    netCents,
    lockedCents,
    minWithdrawalCents,
    availableCents: Math.max(0, netCents - lockedCents),
  };
}

export const getMyEarnings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const balance = await computeUserBalance(supabaseAdmin, context.userId);
    const { data: withdrawals } = await supabaseAdmin
      .from("withdrawals")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    return { ...balance, withdrawals: withdrawals ?? [] };
  });

const CreateInput = z.object({
  amountCents: z.number().int().positive(),
  method: z.enum(["pix", "bank"]),
  pixKeyType: z.enum(PIX_TYPES).optional(),
  pixKey: z.string().optional(),
  bankName: z.string().optional(),
  bankAgency: z.string().optional(),
  bankAccount: z.string().optional(),
  bankAccountType: z.enum(["corrente", "poupanca"]).optional(),
  bankHolderName: z.string().optional(),
  bankHolderDoc: z.string().optional(),
});

export const requestWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const balance = await computeUserBalance(supabaseAdmin, context.userId);
    if (data.amountCents > balance.availableCents) {
      throw new Error("Valor maior que o saldo disponível");
    }
    if (data.amountCents < balance.minWithdrawalCents) {
      throw new Error(
        `Valor mínimo: R$ ${(balance.minWithdrawalCents / 100).toFixed(2).replace(".", ",")}`,
      );
    }

    if (data.method === "pix") {
      if (!data.pixKeyType || !data.pixKey) throw new Error("Informe a chave PIX");
      const err = validatePixKey(data.pixKeyType, data.pixKey);
      if (err) throw new Error(err);
    } else {
      if (
        !data.bankName ||
        !data.bankAgency ||
        !data.bankAccount ||
        !data.bankAccountType ||
        !data.bankHolderName ||
        !data.bankHolderDoc
      ) {
        throw new Error("Preencha todos os dados bancários");
      }
      const doc = onlyDigits(data.bankHolderDoc);
      if (doc.length !== 11 && doc.length !== 14) throw new Error("CPF/CNPJ inválido");
    }

    const insert: any = {
      user_id: context.userId,
      amount_cents: data.amountCents,
      method: data.method,
    };
    if (data.method === "pix") {
      insert.pix_key_type = data.pixKeyType;
      insert.pix_key = data.pixKey!.trim();
    } else {
      insert.bank_name = data.bankName;
      insert.bank_agency = data.bankAgency;
      insert.bank_account = data.bankAccount;
      insert.bank_account_type = data.bankAccountType;
      insert.bank_holder_name = data.bankHolderName;
      insert.bank_holder_doc = onlyDigits(data.bankHolderDoc!);
    }

    const { data: row, error } = await supabaseAdmin
      .from("withdrawals")
      .insert(insert)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const cancelWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: w } = await supabaseAdmin
      .from("withdrawals")
      .select("user_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (!w || w.user_id !== context.userId) throw new Error("Saque não encontrado");
    if (w.status !== "pending") throw new Error("Só é possível cancelar saques pendentes");
    const { error } = await supabaseAdmin
      .from("withdrawals")
      .update({
        status: "rejected",
        admin_notes: "Cancelado pelo usuário",
        processed_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAllWithdrawals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("withdrawals")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const userIds = Array.from(new Set((data ?? []).map((w: any) => w.user_id)));
    const profiles: Record<string, { display_name: string | null; email: string | null }> = {};
    if (userIds.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name")
        .in("id", userIds);
      const { data: au } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
      for (const u of au?.users ?? []) {
        profiles[u.id] = {
          display_name: profs?.find((p: any) => p.id === u.id)?.display_name ?? null,
          email: u.email ?? null,
        };
      }
    }
    return (data ?? []).map((w: any) => ({
      ...w,
      user_display_name: profiles[w.user_id]?.display_name ?? null,
      user_email: profiles[w.user_id]?.email ?? null,
    }));
  });

const UpdateInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["pending", "approved", "rejected", "paid"]),
  adminNotes: z.string().optional(),
});

export const updateWithdrawalStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("withdrawals")
      .update({
        status: data.status,
        admin_notes: data.adminNotes ?? null,
        processed_at: new Date().toISOString(),
        processed_by: context.userId,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
