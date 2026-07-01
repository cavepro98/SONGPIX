import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import {
  ArrowLeft,
  ShieldAlert,
  Trash2,
  Lock,
  Unlock,
  ExternalLink,
  Pencil,
  Shield,
  ShieldOff,
  X,
  Check,
  Users,
  Radio,
  Music2,
  Zap,
  DollarSign,
  TrendingUp,
  UserPlus,
  Activity,
  Percent,
  Ticket,
  Building2,
  Wifi,
  Ban,
  KeyRound,
  Search,
  Settings,
  Save,
  LayoutDashboard,
  Menu,
  Wallet,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  listAdminUsers,
  updateAdminUser,
  toggleAdminRole,
  deleteAdminUser,
  banAdminUser,
  sendAdminPasswordReset,
} from "@/lib/admin-users.functions";
import { getAdminStats } from "@/lib/admin-stats.functions";
import { getPlatformSettings, updatePlatformSettings } from "@/lib/admin-settings.functions";
import { listAllWithdrawals, updateWithdrawalStatus } from "@/lib/withdrawals.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin | SongPIX" }] }),
  beforeLoad: async () => {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) throw redirect({ to: "/auth" });

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) throw redirect({ to: "/dashboard" });
  },
  component: AdminPage,
});

type AdminUser = {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  banned_until: string | null;
  display_name: string | null;
  avatar_url: string | null;
  roles: string[];
};

type Room = {
  id: string;
  slug: string;
  name: string;
  owner_id: string;
  is_open: boolean;
  min_boost_cents: number;
  created_at: string;
};

type QueueItem = {
  id: string;
  room_id: string;
  title: string;
  artist: string | null;
  submitter_name: string;
  paid_amount_cents: number;
  status: string;
  source: string;
  url: string;
  created_at: string;
};

type Stats = {
  rooms: number;
  queued: number;
  played: number;
  boostCents: number;
};

function formatCents(c: number) {
  return (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function exportQueueCSV(items: QueueItem[]) {
  const header = [
    "id",
    "title",
    "artist",
    "submitter_name",
    "source",
    "url",
    "paid_amount_cents",
    "status",
    "created_at",
  ];
  const rows = items.map((i) =>
    header
      .map((k) => {
        const v = (i as any)[k] ?? "";
        const s = String(v).replace(/"/g, '""');
        return `"${s}"`;
      })
      .join(","),
  );
  const csv = [header.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `songpix-fila-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function AdminPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<Stats>({ rooms: 0, queued: 0, played: 0, boostCents: 0 });
  const [tab, setTab] = useState<
    "dashboard" | "rooms" | "queue" | "users" | "withdrawals" | "settings"
  >("dashboard");
  const [withdrawals, setWithdrawals] = useState<Awaited<ReturnType<typeof listAllWithdrawals>>>(
    [],
  );
  const [loadingW, setLoadingW] = useState(false);
  const fetchAllW = useServerFn(listAllWithdrawals);
  const updateW = useServerFn(updateWithdrawalStatus);
  const [adminStats, setAdminStats] = useState<Awaited<ReturnType<typeof getAdminStats>> | null>(
    null,
  );
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [savingUser, setSavingUser] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [settings, setSettings] = useState<any>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  useBodyScrollLock(!!editingUser);

  const fetchUsers = useServerFn(listAdminUsers);
  const saveUser = useServerFn(updateAdminUser);
  const toggleRole = useServerFn(toggleAdminRole);
  const removeUser = useServerFn(deleteAdminUser);
  const banUser = useServerFn(banAdminUser);
  const resetPwd = useServerFn(sendAdminPasswordReset);
  const fetchAdminStats = useServerFn(getAdminStats);
  const fetchSettings = useServerFn(getPlatformSettings);
  const saveSettings = useServerFn(updatePlatformSettings);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setCurrentUserId(u.user.id);
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (error) toast.error(error.message);
      setIsAdmin(!!data);
      setChecking(false);
    })();
  }, []);

  async function loadUsers() {
    try {
      const list = (await fetchUsers()) as AdminUser[];
      setUsers(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar usuários");
    }
  }

  async function handleSaveUser() {
    if (!editingUser) return;
    setSavingUser(true);
    try {
      await saveUser({
        data: {
          userId: editingUser.id,
          displayName: editName,
          email: editEmail !== editingUser.email ? editEmail : undefined,
        },
      });
      toast.success("Usuário atualizado");
      setEditingUser(null);
      loadUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSavingUser(false);
    }
  }

  async function handleToggleAdmin(u: AdminUser) {
    const makeAdmin = !u.roles.includes("admin");
    try {
      await toggleRole({ data: { userId: u.id, makeAdmin } });
      toast.success(makeAdmin ? "Admin concedido" : "Admin removido");
      loadUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function handleDeleteUser(u: AdminUser) {
    if (!confirm(`Excluir definitivamente o usuário ${u.email}? Esta ação não pode ser desfeita.`))
      return;
    try {
      await removeUser({ data: { userId: u.id } });
      toast.success("Usuário excluído");
      loadUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function handleBanUser(u: AdminUser) {
    const isBanned = u.banned_until && new Date(u.banned_until) > new Date();
    if (isBanned) {
      if (!confirm(`Desbanir ${u.email}?`)) return;
      try {
        await banUser({ data: { userId: u.id, durationHours: 0 } });
        toast.success("Usuário desbanido");
        loadUsers();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro");
      }
      return;
    }
    const input = prompt(
      "Banir por quantas horas? (24 = 1 dia, 168 = 1 semana, 8760 = 1 ano)",
      "24",
    );
    if (!input) return;
    const hours = parseInt(input, 10);
    if (!Number.isFinite(hours) || hours <= 0) return toast.error("Duração inválida");
    try {
      await banUser({ data: { userId: u.id, durationHours: hours } });
      toast.success(`Usuário banido por ${hours}h`);
      loadUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function handleResetPassword(u: AdminUser) {
    if (!confirm(`Enviar link de redefinição de senha para ${u.email}?`)) return;
    try {
      await resetPwd({ data: { email: u.email } });
      toast.success("Link de redefinição enviado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function loadAll() {
    const [r, q] = await Promise.all([
      supabase
        .from("rooms")
        .select("*")
        .is("archived_at", null)
        .order("created_at", { ascending: false }),
      supabase.from("queue_items").select("*").order("created_at", { ascending: false }).limit(500),
    ]);
    if (r.error) toast.error(r.error.message);
    if (q.error) toast.error(q.error.message);
    const roomList = (r.data ?? []) as Room[];
    const itemList = (q.data ?? []) as QueueItem[];
    setRooms(roomList);
    setItems(itemList);
    setStats({
      rooms: roomList.length,
      queued: itemList.filter((i) => i.status === "queued").length,
      played: itemList.filter((i) => i.status === "played").length,
      boostCents: itemList.reduce((s, i) => s + (i.paid_amount_cents || 0), 0),
    });
  }

  async function loadAdminStats() {
    try {
      const s = await fetchAdminStats();
      setAdminStats(s);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar stats");
    }
  }

  async function loadSettings() {
    try {
      const s = await fetchSettings();
      setSettings(s);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar configurações");
    }
  }

  async function handleSaveSettings() {
    if (!settings) return;
    setSavingSettings(true);
    try {
      await saveSettings({
        data: {
          platform_name: settings.platform_name,
          commission_rate: Number(settings.commission_rate),
          min_boost_global_cents: Number(settings.min_boost_global_cents),
          max_boost_global_cents: Number(settings.max_boost_global_cents),
          min_withdrawal_cents: Number(settings.min_withdrawal_cents ?? 500),
          allow_signups: !!settings.allow_signups,
          maintenance_mode: !!settings.maintenance_mode,
          support_email: settings.support_email ?? "",
        },
      });
      toast.success("Configurações salvas");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSavingSettings(false);
    }
  }

  useEffect(() => {
    if (isAdmin) {
      loadAll();
      loadUsers();
      loadAdminStats();
      loadSettings();
    }
  }, [isAdmin]);

  useEffect(() => {
    if (tab !== "withdrawals" || !isAdmin) return;
    setLoadingW(true);
    fetchAllW()
      .then((d) => setWithdrawals(d))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro"))
      .finally(() => setLoadingW(false));
  }, [tab, isAdmin]);

  async function toggleRoom(room: Room) {
    const { error } = await supabase
      .from("rooms")
      .update({ is_open: !room.is_open })
      .eq("id", room.id);
    if (error) return toast.error(error.message);
    toast.success(room.is_open ? "Sala fechada" : "Sala aberta");
    loadAll();
  }

  async function deleteRoom(room: Room) {
    if (
      !confirm(
        `Excluir a sala "${room.name}"? A sala e as músicas serão apagadas, mas vendas e estatísticas financeiras serão preservadas.`,
      )
    )
      return;
    const { error } = await supabase.from("rooms").delete().eq("id", room.id);
    if (error) return toast.error(error.message);
    toast.success("Sala excluída");
    loadAll();
  }

  async function deleteItem(item: QueueItem) {
    const { error } = await supabase.from("queue_items").delete().eq("id", item.id);
    if (error) return toast.error(error.message);
    toast.success("Item removido");
    loadAll();
  }

  if (checking) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">
        Verificando permissões...
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-6">
        <div className="max-w-md rounded-xl border border-border bg-surface p-8 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-destructive/15 text-destructive">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h1 className="font-display text-xl font-bold">Acesso restrito</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Esta área é apenas para administradores. Peça para um admin adicionar o seu usuário na
            tabela <code className="rounded bg-surface-2 px-1">user_roles</code> com o papel{" "}
            <code className="rounded bg-surface-2 px-1">admin</code>.
          </p>
          <Link
            to="/dashboard"
            className="mt-5 inline-flex items-center gap-2 rounded-md bg-neon px-4 py-2 text-sm font-medium text-neon-foreground hover:opacity-90"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
        </div>
      </div>
    );
  }

  const navItems = [
    {
      id: "dashboard" as const,
      label: "Dashboard",
      icon: LayoutDashboard,
      count: null as number | null,
    },
    { id: "rooms" as const, label: "Salas", icon: Radio, count: rooms.length },
    { id: "queue" as const, label: "Fila", icon: Music2, count: items.length },
    { id: "users" as const, label: "Usuários", icon: Users, count: users.length },
    {
      id: "withdrawals" as const,
      label: "Saques",
      icon: Wallet,
      count: withdrawals.length || null,
    },
    { id: "settings" as const, label: "Configurações", icon: Settings, count: null },
  ];

  async function handleUpdateW(id: string, status: "approved" | "rejected" | "paid") {
    const notes =
      status === "rejected" ? (prompt("Motivo da rejeição (opcional):") ?? undefined) : undefined;
    try {
      await updateW({ data: { id, status, adminNotes: notes } });
      toast.success("Saque atualizado");
      const d = await fetchAllW();
      setWithdrawals(d);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-border bg-surface/80 backdrop-blur transition-transform duration-200 lg:static lg:translate-x-0 ${
          navOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <Link
            to="/dashboard"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>SongPIX</span>
          </Link>
          <span className="rounded-full border border-neon/40 bg-neon/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-neon">
            admin
          </span>
        </div>

        <div className="px-5 py-4">
          <h1 className="font-display text-base font-bold">Painel admin</h1>
          <p className="text-[11px] text-muted-foreground">Gerenciar plataforma</p>
        </div>

        <nav className="flex-1 space-y-1 px-3 pb-4">
          {navItems.map((it) => {
            const active = tab === it.id;
            const Icon = it.icon;
            return (
              <button
                key={it.id}
                onClick={() => {
                  setTab(it.id);
                  setNavOpen(false);
                }}
                className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  active
                    ? "bg-neon text-neon-foreground"
                    : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">{it.label}</span>
                {it.count !== null && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-mono tabular-nums ${
                      active
                        ? "bg-neon-foreground/15 text-neon-foreground"
                        : "bg-surface-2 text-muted-foreground"
                    }`}
                  >
                    {it.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Backdrop mobile */}
      {navOpen && (
        <div
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border bg-surface/60 px-4 py-3 backdrop-blur lg:hidden">
          <button
            onClick={() => setNavOpen(true)}
            className="rounded-md border border-border p-2 text-muted-foreground hover:text-foreground"
            aria-label="Abrir menu"
          >
            <Menu className="h-4 w-4" />
          </button>
          <h1 className="font-display text-sm font-bold">Painel admin</h1>
          <span className="ml-auto rounded-full border border-neon/40 bg-neon/10 px-2 py-0.5 text-[10px] font-bold uppercase text-neon">
            admin
          </span>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          <div className="mb-6 hidden items-center justify-between lg:flex">
            <div>
              <h2 className="font-display text-2xl font-bold capitalize">{tab}</h2>
              <p className="text-xs text-muted-foreground">
                {tab === "dashboard" && "Visão geral da plataforma"}
                {tab === "rooms" && `${rooms.length} salas cadastradas`}
                {tab === "queue" && `${items.length} itens na fila global`}
                {tab === "users" && `${users.length} usuários registrados`}
                {tab === "withdrawals" && `${withdrawals.length} solicitações de saque`}
                {tab === "settings" && "Parâmetros globais da plataforma"}
              </p>
            </div>
          </div>

          {tab === "dashboard" && <DashboardPanel data={adminStats} />}

          {tab === "rooms" && (
            <div className="mt-4 overflow-hidden rounded-xl border border-border bg-surface">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Nome</th>
                    <th className="px-4 py-3">Slug</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Fura fila mín.</th>
                    <th className="px-4 py-3">Receita 30d</th>
                    <th className="px-4 py-3">Criada</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((r) => {
                    const rev = adminStats?.roomRevenue?.[r.id] ?? 0;
                    return (
                      <tr key={r.id} className="border-t border-border">
                        <td className="px-4 py-3 font-medium">{r.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{r.slug}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs ${r.is_open ? "bg-neon/15 text-neon" : "bg-muted text-muted-foreground"}`}
                          >
                            {r.is_open ? "aberta" : "fechada"}
                          </span>
                        </td>
                        <td className="px-4 py-3">{formatCents(r.min_boost_cents)}</td>
                        <td className="px-4 py-3 tabular-nums text-neon">{formatCents(rev)}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {new Date(r.created_at).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <a
                              href={`/${r.slug}`}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground"
                              title="Abrir página pública"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                            <button
                              onClick={() => toggleRoom(r)}
                              className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground"
                              title={r.is_open ? "Fechar" : "Abrir"}
                            >
                              {r.is_open ? (
                                <Lock className="h-4 w-4" />
                              ) : (
                                <Unlock className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              onClick={() => deleteRoom(r)}
                              className="rounded-md border border-destructive/40 p-1.5 text-destructive hover:bg-destructive/10"
                              title="Excluir"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {rooms.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                        Nenhuma sala ainda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === "queue" && (
            <div className="mt-4 space-y-3">
              <div className="flex justify-end">
                <button
                  onClick={() => exportQueueCSV(items)}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Exportar CSV
                </button>
              </div>
              <div className="overflow-hidden rounded-xl border border-border bg-surface">
                <table className="w-full text-sm">
                  <thead className="bg-surface-2 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Música</th>
                      <th className="px-4 py-3">Quem enviou</th>
                      <th className="px-4 py-3">Fonte</th>
                      <th className="px-4 py-3">Fura fila</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((i) => (
                      <tr key={i.id} className="border-t border-border">
                        <td className="px-4 py-3">
                          <div className="font-medium">{i.title}</div>
                          {i.artist && (
                            <div className="text-xs text-muted-foreground">{i.artist}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{i.submitter_name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{i.source}</td>
                        <td className="px-4 py-3">{formatCents(i.paid_amount_cents)}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted-foreground">
                            {i.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <a
                              href={i.url}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground"
                              title="Abrir link"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                            <button
                              onClick={() => deleteItem(i)}
                              className="rounded-md border border-destructive/40 p-1.5 text-destructive hover:bg-destructive/10"
                              title="Remover"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                          Nada na fila.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "users" && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Buscar por nome ou email…"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                <span className="text-xs text-muted-foreground">{users.length} total</span>
              </div>
              <div className="overflow-hidden rounded-xl border border-border bg-surface">
                <table className="w-full text-sm">
                  <thead className="bg-surface-2 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Usuário</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Papéis</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Último login</th>
                      <th className="px-4 py-3">Criado</th>
                      <th className="px-4 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users
                      .filter((u) => {
                        const q = userSearch.trim().toLowerCase();
                        if (!q) return true;
                        return (
                          u.email.toLowerCase().includes(q) ||
                          (u.display_name ?? "").toLowerCase().includes(q)
                        );
                      })
                      .map((u) => {
                        const isAdminRow = u.roles.includes("admin");
                        const isSelf = u.id === currentUserId;
                        const isBanned = !!u.banned_until && new Date(u.banned_until) > new Date();
                        return (
                          <tr key={u.id} className="border-t border-border">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                {u.avatar_url ? (
                                  <img
                                    src={u.avatar_url}
                                    alt=""
                                    className="h-8 w-8 rounded-full object-cover"
                                  />
                                ) : (
                                  <div className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-xs font-bold text-muted-foreground">
                                    {(u.display_name ?? u.email).slice(0, 1).toUpperCase()}
                                  </div>
                                )}
                                <div>
                                  <div className="font-medium">{u.display_name ?? "—"}</div>
                                  {isSelf && (
                                    <div className="text-[10px] uppercase text-neon">você</div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                            <td className="px-4 py-3">
                              {isAdminRow ? (
                                <span className="rounded-full bg-neon/15 px-2 py-0.5 text-xs text-neon">
                                  admin
                                </span>
                              ) : (
                                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted-foreground">
                                  user
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {isBanned ? (
                                <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs text-destructive">
                                  banido
                                </span>
                              ) : (
                                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted-foreground">
                                  ativo
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {u.last_sign_in_at
                                ? new Date(u.last_sign_in_at).toLocaleDateString("pt-BR")
                                : "—"}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {new Date(u.created_at).toLocaleDateString("pt-BR")}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => {
                                    setEditingUser(u);
                                    setEditName(u.display_name ?? "");
                                    setEditEmail(u.email);
                                  }}
                                  className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground"
                                  title="Editar"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleResetPassword(u)}
                                  className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground"
                                  title="Enviar redefinição de senha"
                                >
                                  <KeyRound className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleToggleAdmin(u)}
                                  disabled={isSelf && isAdminRow}
                                  className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
                                  title={isAdminRow ? "Remover admin" : "Tornar admin"}
                                >
                                  {isAdminRow ? (
                                    <ShieldOff className="h-4 w-4" />
                                  ) : (
                                    <Shield className="h-4 w-4" />
                                  )}
                                </button>
                                <button
                                  onClick={() => handleBanUser(u)}
                                  disabled={isSelf}
                                  className={`rounded-md border p-1.5 disabled:opacity-40 ${isBanned ? "border-neon/40 text-neon hover:bg-neon/10" : "border-border text-muted-foreground hover:text-foreground"}`}
                                  title={isBanned ? "Desbanir" : "Banir"}
                                >
                                  <Ban className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteUser(u)}
                                  disabled={isSelf}
                                  className="rounded-md border border-destructive/40 p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-40"
                                  title="Excluir"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    {users.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                          Nenhum usuário.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "withdrawals" && (
            <div className="mt-4 overflow-hidden rounded-xl border border-border bg-surface">
              {loadingW ? (
                <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
              ) : !withdrawals.length ? (
                <div className="p-6 text-sm text-muted-foreground">
                  Nenhuma solicitação de saque.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-2 text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">Data</th>
                        <th className="px-4 py-3">Usuário</th>
                        <th className="px-4 py-3">Valor</th>
                        <th className="px-4 py-3">Método</th>
                        <th className="px-4 py-3">Destino</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {withdrawals.map((w: any) => (
                        <tr key={w.id} className="border-t border-border align-top">
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {new Date(w.created_at).toLocaleString("pt-BR")}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium">{w.user_display_name ?? "—"}</div>
                            <div className="text-[10px] text-muted-foreground">{w.user_email}</div>
                          </td>
                          <td className="px-4 py-3 font-bold tabular-nums">
                            {formatCents(w.amount_cents)}
                          </td>
                          <td className="px-4 py-3 uppercase text-xs">{w.method}</td>
                          <td className="px-4 py-3 text-xs">
                            {w.method === "pix" ? (
                              <>
                                <div className="uppercase text-[10px] text-muted-foreground">
                                  {w.pix_key_type}
                                </div>
                                <div className="break-all">{w.pix_key}</div>
                              </>
                            ) : (
                              <div className="space-y-0.5">
                                <div>
                                  {w.bank_name} · {w.bank_account_type}
                                </div>
                                <div className="text-muted-foreground">
                                  Ag {w.bank_agency} · Cc {w.bank_account}
                                </div>
                                <div className="text-muted-foreground">
                                  {w.bank_holder_name} ({w.bank_holder_doc})
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-block rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-bold uppercase">
                              {w.status}
                            </span>
                            {w.admin_notes && (
                              <p className="mt-1 max-w-[200px] text-[10px] text-muted-foreground">
                                {w.admin_notes}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex flex-wrap justify-end gap-1">
                              {w.status === "pending" && (
                                <>
                                  <button
                                    onClick={() => handleUpdateW(w.id, "approved")}
                                    className="rounded-md border border-blue-500/40 bg-blue-500/10 px-2 py-1 text-[10px] font-bold uppercase text-blue-400 hover:bg-blue-500/20"
                                  >
                                    Aprovar
                                  </button>
                                  <button
                                    onClick={() => handleUpdateW(w.id, "rejected")}
                                    className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-[10px] font-bold uppercase text-destructive hover:bg-destructive/20"
                                  >
                                    Rejeitar
                                  </button>
                                </>
                              )}
                              {w.status === "approved" && (
                                <button
                                  onClick={() => handleUpdateW(w.id, "paid")}
                                  className="rounded-md border border-neon/40 bg-neon/10 px-2 py-1 text-[10px] font-bold uppercase text-neon hover:bg-neon/20"
                                >
                                  Marcar pago
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === "settings" && (
            <div className="mt-4 max-w-2xl rounded-xl border border-border bg-surface p-6">
              {!settings ? (
                <div className="text-sm text-muted-foreground">Carregando…</div>
              ) : (
                <div className="space-y-5">
                  <div>
                    <h2 className="font-display text-lg font-bold">Configurações Gerais</h2>
                    <p className="text-xs text-muted-foreground">
                      Parâmetros globais da plataforma
                      {settings.updated_at
                        ? ` · atualizado em ${new Date(settings.updated_at).toLocaleString("pt-BR")}`
                        : ""}
                      .
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs uppercase text-muted-foreground">
                        Nome da plataforma
                      </label>
                      <input
                        type="text"
                        value={settings.platform_name}
                        onChange={(e) =>
                          setSettings({ ...settings, platform_name: e.target.value })
                        }
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-neon"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs uppercase text-muted-foreground">
                        Email de suporte
                      </label>
                      <input
                        type="email"
                        value={settings.support_email ?? ""}
                        onChange={(e) =>
                          setSettings({ ...settings, support_email: e.target.value })
                        }
                        placeholder="suporte@songpix.app"
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-neon"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs uppercase text-muted-foreground">
                        Comissão da plataforma (
                        {(Number(settings.commission_rate) * 100).toFixed(1)}%)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        value={settings.commission_rate}
                        onChange={(e) =>
                          setSettings({ ...settings, commission_rate: e.target.value })
                        }
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-neon"
                      />
                      <p className="mt-1 text-[10px] text-muted-foreground">Use 0.10 para 10%.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-xs uppercase text-muted-foreground">
                          Fura fila mín. (R$)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={(Number(settings.min_boost_global_cents) / 100).toString()}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              min_boost_global_cents: Math.round(Number(e.target.value) * 100),
                            })
                          }
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-neon"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs uppercase text-muted-foreground">
                          Fura fila máx. (R$)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={(Number(settings.max_boost_global_cents) / 100).toString()}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              max_boost_global_cents: Math.round(Number(e.target.value) * 100),
                            })
                          }
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-neon"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="mb-1 block text-xs uppercase text-muted-foreground">
                          Saque mínimo (R$)
                        </label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={(Number(settings.min_withdrawal_cents ?? 500) / 100).toString()}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              min_withdrawal_cents: Math.max(
                                100,
                                Math.round(Number(e.target.value) * 100),
                              ),
                            })
                          }
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-neon"
                        />
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          Valor mínimo que o criador pode solicitar por saque.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={!!settings.allow_signups}
                        onChange={(e) =>
                          setSettings({ ...settings, allow_signups: e.target.checked })
                        }
                      />
                      Permitir novos cadastros
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={!!settings.maintenance_mode}
                        onChange={(e) =>
                          setSettings({ ...settings, maintenance_mode: e.target.checked })
                        }
                      />
                      Modo manutenção (esconde a plataforma para usuários)
                    </label>
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={handleSaveSettings}
                      disabled={savingSettings}
                      className="inline-flex items-center gap-2 rounded-md bg-neon px-4 py-2 text-sm font-medium text-neon-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" /> Salvar configurações
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {editingUser && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
          onClick={() => setEditingUser(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-xl border border-border bg-surface p-6"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Editar usuário</h2>
              <button
                onClick={() => setEditingUser(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs uppercase text-muted-foreground">Nome</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-neon"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase text-muted-foreground">Email</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-neon"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setEditingUser(null)}
                className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveUser}
                disabled={savingUser}
                className="inline-flex items-center gap-1 rounded-md bg-neon px-3 py-2 text-sm font-medium text-neon-foreground hover:opacity-90 disabled:opacity-50"
              >
                <Check className="h-4 w-4" /> Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-2xl font-bold">{value}</div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: any;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-surface p-4 ${accent ? "border-neon/40" : "border-border"}`}
    >
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <Icon className={`h-4 w-4 ${accent ? "text-neon" : "text-muted-foreground"}`} />
      </div>
      <div
        className={`mt-2 font-display text-2xl font-bold tabular-nums ${accent ? "text-neon" : "text-foreground"}`}
      >
        {value}
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 text-xs font-mono uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {children as any}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function DashboardPanel({ data }: { data: Awaited<ReturnType<typeof getAdminStats>> | null }) {
  if (!data) {
    return <div className="mt-6 text-sm text-muted-foreground">Carregando métricas…</div>;
  }
  const c = data.cards;
  const tickFmt = (v: number) => `R$${v.toFixed(0)}`;
  const dateFmt = (d: string) => d.slice(5);

  return (
    <div className="mt-6 space-y-6">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        <MetricCard label="Usuários cadastrados" value={c.totalUsers.toString()} icon={Users} />
        <MetricCard label="Criadores ativos" value={c.activeCreators.toString()} icon={Radio} />
        <MetricCard label="Salas criadas" value={c.totalRooms.toString()} icon={Building2} />
        <MetricCard label="Salas abertas agora" value={c.openRooms.toString()} icon={Unlock} />
        <MetricCard label="Lives em andamento" value={c.livesNow.toString()} icon={Wifi} accent />
        <MetricCard label="Músicas enviadas hoje" value={c.songsToday.toString()} icon={Music2} />
        <MetricCard label="Fura filas hoje" value={c.boostsToday.toString()} icon={Zap} />
        <MetricCard
          label="Volume financeiro hoje"
          value={formatCents(c.volumeTodayCents)}
          icon={DollarSign}
          accent
        />
        <MetricCard
          label="Comissão hoje"
          value={formatCents(c.commissionTodayCents)}
          icon={Percent}
        />
        <MetricCard
          label="Ticket médio (hoje)"
          value={formatCents(c.ticketTodayCents)}
          icon={Ticket}
        />
        <MetricCard
          label="Receita últimos 30 dias"
          value={formatCents(c.revenue30Cents)}
          icon={TrendingUp}
        />
        <MetricCard
          label="Novos usuários hoje"
          value={c.newUsersToday.toString()}
          icon={UserPlus}
        />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <ChartCard title="Receita por dia (30d)">
          <AreaChart data={data.daily}>
            <defs>
              <linearGradient id="gReceita" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--neon))" stopOpacity={0.6} />
                <stop offset="100%" stopColor="hsl(var(--neon))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="date"
              tickFormatter={dateFmt}
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
            />
            <YAxis tickFormatter={tickFmt} stroke="hsl(var(--muted-foreground))" fontSize={10} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--surface))",
                border: "1px solid hsl(var(--border))",
                fontSize: 12,
              }}
              formatter={(v: number) => `R$ ${v.toFixed(2)}`}
            />
            <Area
              type="monotone"
              dataKey="receita"
              stroke="hsl(var(--neon))"
              fill="url(#gReceita)"
            />
          </AreaChart>
        </ChartCard>

        <ChartCard title="Pedidos por hora (hoje)">
          <BarChart data={data.hourly}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="hora"
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              interval={2}
            />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--surface))",
                border: "1px solid hsl(var(--border))",
                fontSize: 12,
              }}
            />
            <Bar dataKey="pedidos" fill="hsl(var(--neon))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartCard>

        <ChartCard title="Novos cadastros (30d)">
          <BarChart data={data.daily}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="date"
              tickFormatter={dateFmt}
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
            />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--surface))",
                border: "1px solid hsl(var(--border))",
                fontSize: 12,
              }}
            />
            <Bar dataKey="cadastros" fill="hsl(var(--neon))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartCard>

        <ChartCard title="Ticket médio (30d)">
          <LineChart data={data.daily}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="date"
              tickFormatter={dateFmt}
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
            />
            <YAxis tickFormatter={tickFmt} stroke="hsl(var(--muted-foreground))" fontSize={10} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--surface))",
                border: "1px solid hsl(var(--border))",
                fontSize: 12,
              }}
              formatter={(v: number) => `R$ ${v.toFixed(2)}`}
            />
            <Line
              type="monotone"
              dataKey="ticket"
              stroke="hsl(var(--neon))"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ChartCard>

        <ChartCard title="Comissão por dia (30d)">
          <AreaChart data={data.daily}>
            <defs>
              <linearGradient id="gCom" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--neon))" stopOpacity={0.4} />
                <stop offset="100%" stopColor="hsl(var(--neon))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="date"
              tickFormatter={dateFmt}
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
            />
            <YAxis tickFormatter={tickFmt} stroke="hsl(var(--muted-foreground))" fontSize={10} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--surface))",
                border: "1px solid hsl(var(--border))",
                fontSize: 12,
              }}
              formatter={(v: number) => `R$ ${v.toFixed(2)}`}
            />
            <Area type="monotone" dataKey="comissao" stroke="hsl(var(--neon))" fill="url(#gCom)" />
          </AreaChart>
        </ChartCard>

        <ChartCard title="Top salas por receita (30d)">
          <BarChart data={data.topRooms} layout="vertical" margin={{ left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              type="number"
              tickFormatter={tickFmt}
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={100}
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--surface))",
                border: "1px solid hsl(var(--border))",
                fontSize: 12,
              }}
              formatter={(v: number) => `R$ ${v.toFixed(2)}`}
            />
            <Bar dataKey="receita" fill="hsl(var(--neon))" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ChartCard>

        <ChartCard title="Criadores ativos (30d)">
          <LineChart data={data.daily}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="date"
              tickFormatter={dateFmt}
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
            />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--surface))",
                border: "1px solid hsl(var(--border))",
                fontSize: 12,
              }}
            />
            <Line
              type="monotone"
              dataKey="boosts"
              stroke="hsl(var(--neon))"
              strokeWidth={2}
              dot={false}
              name="fura filas/dia"
            />
          </LineChart>
        </ChartCard>
      </section>
    </div>
  );
}
