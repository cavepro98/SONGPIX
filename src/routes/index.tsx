import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  ListMusic,
  Zap,
  Music2,
  Radio,
  Headphones,
  DollarSign,
  ShieldCheck,
  Infinity as InfinityIcon,
  Globe,
  Smartphone,
  MousePointerClick,
  TrendingUp,
  Users,
  CheckCircle2,
  Mic2,
  Tv,
  Gamepad2,
} from "lucide-react";
import { isSupabaseClientConfigured, supabase } from "@/integrations/supabase/client";
import bgNoise from "@/assets/bg-noise.gif";

type QueueTrack = { id: string; title: string; user: string; price: string; hot?: boolean };

const INITIAL_QUEUE: QueueTrack[] = [
  { id: "a", title: "Brazilian Phonk Drift", user: "@lucas_vibe", price: "R$ 80,00", hot: true },
  { id: "b", title: "Cyberpunk — Hyper", user: "@neon_rider", price: "R$ 50,00", hot: true },
  { id: "c", title: "Estilo Cachorro", user: "@rap_nacional", price: "R$ 15,00" },
  { id: "d", title: "Drift Pesado", user: "@dj_tk", price: "FREE" },
  { id: "e", title: "Madrugada 3AM", user: "@kaio.mc", price: "R$ 25,00" },
  { id: "f", title: "Baile do Helipa", user: "@mc_vrau", price: "R$ 120,00", hot: true },
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SongPIX | fila de músicas pra suas lives" },
      {
        name: "description",
        content:
          "Crie a sala da sua live. Seus viewers mandam música pela fila e quem paga mais sobe no topo.",
      },
      { property: "og:title", content: "SongPIX — fila ao vivo, controlada por quem paga mais" },
      {
        property: "og:description",
        content: "Console industrial pra DJs e streamers. Fila compartilhada com fura fila.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!isSupabaseClientConfigured()) return;

    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled && data.user) {
        navigate({ to: "/dashboard", replace: true });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const [queue, setQueue] = useState<QueueTrack[]>(INITIAL_QUEUE);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const id = setInterval(() => {
      setLeaving(true);
      setTimeout(() => {
        setQueue((prev) => {
          const [first, ...rest] = prev;
          return [...rest, { ...first, hot: false }];
        });
        setLeaving(false);
      }, 900);
    }, 8000);
    return () => clearInterval(id);
  }, []);

  const nowPlaying = queue[0];
  const upcoming = queue.slice(1, 4);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* NAV */}
      <nav className="flex items-center justify-between border-b border-border px-6 py-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center bg-neon text-neon-foreground">
            <ListMusic className="h-4 w-4" />
          </div>
          <span className="font-display text-lg font-bold italic uppercase tracking-tighter">
            Song<span className="text-neon">PIX</span>
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            to="/auth"
            className="hidden border border-border px-4 py-2 font-display text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:border-neon hover:text-foreground sm:inline-block"
          >
            Entrar
          </Link>
          <Link
            to="/auth"
            className="inline-flex items-center gap-1 border border-neon bg-neon px-4 py-2 font-display text-[10px] font-bold uppercase tracking-widest text-neon-foreground hover:opacity-90"
          >
            Criar sala <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border">
        <div
          className="pointer-events-none absolute inset-0 opacity-75 mix-blend-overlay"
          style={{
            backgroundImage: `url(${bgNoise})`,
            backgroundRepeat: "repeat",
            backgroundSize: "240px 240px",
          }}
        />

        <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-6 py-20 lg:grid-cols-[1.1fr_0.9fr] lg:py-28">
          {/* Left content */}
          <div className="flex flex-col justify-center">
            <div className="mb-6 inline-flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-neon shadow-[0_0_8px_var(--neon)]" />
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-neon">
                Live Queue System
              </span>
            </div>

            <h1 className="font-display text-5xl font-bold italic uppercase leading-[0.9] tracking-tighter sm:text-6xl lg:text-7xl">
              A sua live <br />
              no <span className="text-neon">controle</span> deles.
            </h1>

            <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
              SongPIX é a fila de músicas interativa que transforma seus viewers em DJ's. Eles
              mandam o link, pagam pra furar a fila, e você toca o hype em tempo real. Ideal pra
              streamers, DJs e criadores de conteúdo que querem monetizar a interação.
            </p>

            <div className="mt-10 flex flex-wrap gap-3">
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 border border-neon bg-neon px-8 py-4 font-display text-xs font-bold uppercase tracking-widest text-neon-foreground transition-all hover:opacity-90"
              >
                Criar sala agora <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/auth"
                className="border border-border px-8 py-4 font-display text-xs font-bold uppercase tracking-widest text-foreground transition-all hover:border-neon hover:text-neon"
              >
                Já tenho conta
              </Link>
            </div>

            <div className="mt-14 flex gap-10">
              <div>
                <div className="font-display text-2xl font-bold text-neon">120+</div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Lives Ativas
                </div>
              </div>
              <div>
                <div className="font-display text-2xl font-bold text-neon">0.4s</div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Latência
                </div>
              </div>
              <div>
                <div className="font-display text-2xl font-bold text-neon">8K</div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Tocadas/Dia
                </div>
              </div>
            </div>
          </div>

          {/* Right: Queue console */}
          <div className="relative">
            <div className="absolute -top-3 -left-3 h-10 w-10 border-t-2 border-l-2 border-neon" />
            <div className="absolute -bottom-3 -right-3 h-10 w-10 border-b-2 border-r-2 border-neon" />

            <aside className="bg-surface-2 p-6 sm:p-8">
              <div className="mb-6 flex items-center justify-between font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <span>Fila ao vivo</span>
                <span className="text-neon">3 ATIVOS</span>
              </div>

              {/* Tocando */}
              <div
                key={nowPlaying.id}
                className={`relative mb-3 border border-neon/30 bg-neon/5 p-4 ${leaving ? "animate-[soft-out_0.9s_cubic-bezier(0.4,0,0.2,1)_both]" : "animate-[soft-in_1.4s_cubic-bezier(0.22,1,0.36,1)_both]"}`}
              >
                <div className="absolute right-0 top-0 flex items-center gap-1 bg-neon px-1.5 py-0.5 font-display text-[9px] font-bold uppercase tracking-tighter text-neon-foreground">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-neon-foreground" />
                  No Ar
                </div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-neon">
                  Tocando
                </p>
                <h3 className="mt-1 truncate font-display text-base font-bold">
                  {nowPlaying.title}
                </h3>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">
                  enviado por {nowPlaying.user}
                </p>
                <div className="mt-3 flex items-end gap-1 h-4">
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                    <span
                      key={i}
                      className="w-1 bg-neon"
                      style={{
                        animation: `eqbar 1.6s ease-in-out ${i * 0.12}s infinite alternate`,
                        height: "30%",
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Fila */}
              <div
                className={`space-y-2 transition-all duration-700 ${leaving ? "opacity-40 blur-[2px]" : "opacity-100"}`}
              >
                {upcoming.map((s, i) => (
                  <div
                    key={s.id}
                    style={{ animationDelay: `${i * 220}ms` }}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border border-border bg-background p-3 animate-[slide-up_1.4s_cubic-bezier(0.22,1,0.36,1)_both] transition-all duration-500 hover:-translate-y-0.5"
                  >
                    <span className="font-display text-xl font-bold text-muted-foreground/40 tabular-nums">
                      {String(i + 2).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <h4 className="truncate text-xs font-bold">{s.title}</h4>
                      <p className="truncate font-mono text-[10px] uppercase text-muted-foreground">
                        {s.user}
                      </p>
                    </div>
                    <div
                      className={`skew-x-[-12deg] border px-2.5 py-1 font-display text-[10px] font-bold ${
                        s.hot
                          ? "border-neon bg-neon text-neon-foreground"
                          : "border-border bg-surface-2 text-muted-foreground"
                      }`}
                    >
                      <span className="inline-block skew-x-[12deg] tabular-nums">{s.price}</span>
                    </div>
                  </div>
                ))}
              </div>

              <button className="mt-4 flex w-full items-center justify-center gap-2 border-2 border-neon bg-transparent px-3 py-3 font-display text-[10px] font-bold uppercase tracking-[0.2em] text-neon transition-all hover:bg-neon hover:text-neon-foreground">
                <Zap className="h-3 w-3" /> Furar a Fila
              </button>

              <div className="mt-6 grid grid-cols-2 gap-px border border-border bg-border">
                <div className="bg-background p-3">
                  <div className="font-mono text-[9px] uppercase text-muted-foreground">
                    Arrecadado
                  </div>
                  <div className="font-display text-sm font-bold">R$ 2.450</div>
                </div>
                <div className="bg-background p-3">
                  <div className="font-mono text-[9px] uppercase text-muted-foreground">
                    Tocadas
                  </div>
                  <div className="font-display text-sm font-bold">142</div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/* PARA QUEM É */}
      <section className="border-b border-border bg-surface-2 px-6 py-20 sm:px-12 lg:px-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 flex items-center gap-3">
            <div className="h-[2px] w-12 bg-neon" />
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-neon">
              Para quem é
            </span>
          </div>

          <h2 className="mb-8 max-w-2xl font-display text-3xl font-bold uppercase leading-tight tracking-tight sm:text-4xl">
            Feito pra quem vive no <span className="text-neon">palco digital</span>.
          </h2>

          <div className="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Mic2,
                title: "DJs & Produtores",
                desc: "Deixe o público escolher o próximo drop. Fila ao vivo, prioridade por pagamento e controle total da pista virtual.",
              },
              {
                icon: Tv,
                title: "Streamers & Creators",
                desc: "Transforme sua live em uma experiência sonora interativa. Viewers mandam músicas, pagam pra furar a fila e o engajamento explode.",
              },
              {
                icon: Gamepad2,
                title: "Gamers & IRL",
                desc: "Perfeito pra quem faz Just Chatting, gameplay ou IRL. A música vira parte da conversa e a comunidade se conecta de verdade.",
              },
              {
                icon: Radio,
                title: "Rádios Online",
                desc: "Abra a programação pro ouvinte. Quem pagar mais, escolhe o som. Uma nova forma de monetizar sua audiência em tempo real.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="bg-background p-8 transition-colors hover:bg-surface-2"
              >
                <item.icon className="mb-4 h-6 w-6 text-neon" />
                <h3 className="font-display text-base font-bold uppercase tracking-tight">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA — passo a passo */}
      <section className="border-b border-border px-6 py-20 sm:px-12 lg:px-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 flex items-center gap-3">
            <div className="h-[2px] w-12 bg-neon" />
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-neon">
              Como funciona
            </span>
          </div>

          <h2 className="mb-12 max-w-2xl font-display text-3xl font-bold uppercase leading-tight tracking-tight sm:text-4xl">
            Em <span className="text-neon">3 passos</span> sua live vira uma festa.
          </h2>

          <div className="grid gap-px border border-border bg-border sm:grid-cols-3">
            {[
              {
                k: "01",
                icon: Globe,
                t: "Crie sua sala",
                d: "Configure o nome, o preço mínimo do fura fila e as plataformas que aceita — YouTube, Spotify e SoundCloud. É gratuito e leva menos de 1 minuto.",
              },
              {
                k: "02",
                icon: MousePointerClick,
                t: "Compartilhe o link",
                d: "Divulgue o link da sua fila no chat da live, bio do TikTok, Instagram ou Discord. Seus viewers acessam e colam o link da música que querem ouvir.",
              },
              {
                k: "03",
                icon: TrendingUp,
                t: "Monetize o hype",
                d: "Quem quiser prioridade paga o valor que achar justo. Quanto maior o valor, mais alto na fila. Você controla tudo pelo painel em tempo real.",
              },
            ].map((f) => (
              <div key={f.k} className="bg-background p-8">
                <div className="mb-4 flex h-12 w-12 items-center justify-center border border-neon/30 bg-neon/5">
                  <f.icon className="h-5 w-5 text-neon" />
                </div>
                <span className="font-mono text-[10px] font-bold text-neon">PASSO {f.k}</span>
                <h3 className="mt-3 font-display text-lg font-bold uppercase tracking-tight">
                  {f.t}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES GRID */}
      <section className="border-b border-border bg-surface-2 px-6 py-20 sm:px-12 lg:px-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 flex items-center gap-3">
            <div className="h-[2px] w-12 bg-neon" />
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-neon">
              Recursos
            </span>
          </div>

          <h2 className="mb-12 max-w-2xl font-display text-3xl font-bold uppercase leading-tight tracking-tight sm:text-4xl">
            Tudo que você precisa pra <span className="text-neon">tocar o som</span> sem dor de
            cabeça.
          </h2>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Music2,
                t: "Múltiplas plataformas",
                d: "Aceite links do YouTube, Spotify e SoundCloud. O sistema reconhece automaticamente a origem e exibe a capa, título e artista.",
              },
              {
                icon: DollarSign,
                t: "Preço sob seu controle",
                d: "Você define o valor mínimo pro fura fila. O viewer pode pagar acima disso pra garantir o topo da fila. Você escolhe, o público decide.",
              },
              {
                icon: Zap,
                t: "Fila em tempo real",
                d: "Atualizações instantâneas. Quando alguém paga, a fila reorganiza na tela de todos. Sem refresh, sem delay.",
              },
              {
                icon: Smartphone,
                t: "100% responsivo",
                d: "Seu público acessa do celular, tablet ou desktop. A fila se adapta perfeitamente a qualquer tela, sem app pra instalar.",
              },
              {
                icon: ShieldCheck,
                t: "Moderação simples",
                d: "Remova músicas indesejadas, pause a fila ou limpe tudo com um clique. Controle total do que toca na sua live.",
              },
              {
                icon: InfinityIcon,
                t: "Filas ilimitadas",
                d: "Crie quantas salas quiser. Uma pra cada live, evento ou vibe diferente. Gerencie tudo de um único painel.",
              },
            ].map((f, i) => (
              <div key={i} className="border border-border bg-background p-6">
                <f.icon className="mb-4 h-5 w-5 text-neon" />
                <h3 className="font-display text-sm font-bold uppercase tracking-tight">{f.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF */}
      <section className="border-b border-border px-6 py-20 sm:px-12 lg:px-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 flex items-center gap-3">
            <div className="h-[2px] w-12 bg-neon" />
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-neon">
              Quem usa
            </span>
          </div>

          <h2 className="mb-12 max-w-2xl font-display text-3xl font-bold uppercase leading-tight tracking-tight sm:text-4xl">
            A galera já tá <span className="text-neon">no hype</span>.
          </h2>

          <div className="grid gap-px border border-border bg-border sm:grid-cols-3">
            {[
              {
                quote:
                  "Minhas lives de drift viraram evento. O chat enlouquece quando alguém paga R$ 100 pra furar a fila com Brazilian Phonk.",
                author: "Lucas Vibe",
                role: "Streamer de Drift",
              },
              {
                quote:
                  "Antes eu tinha que ler comentário por comentário. Agora o público manda o link e paga pra priorizar. O engajamento triplicou.",
                author: "DJ TK",
                role: "DJ & Produtor",
              },
              {
                quote:
                  "Uso em todas as minhas lives de Just Chatting. Os viewers adoram ver a fila subindo e o equalizador pulsando junto.",
                author: "Kaio MC",
                role: "Creator de IRL",
              },
            ].map((t, i) => (
              <div key={i} className="bg-background p-8">
                <p className="text-sm leading-relaxed text-muted-foreground">“{t.quote}”</p>
                <div className="mt-6 flex items-center gap-3">
                  <div className="h-8 w-8 bg-neon/10" />
                  <div>
                    <div className="font-display text-xs font-bold uppercase">{t.author}</div>
                    <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {t.role}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PREÇOS / MODELO */}
      <section className="border-b border-border bg-surface-2 px-6 py-20 sm:px-12 lg:px-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 flex items-center gap-3">
            <div className="h-[2px] w-12 bg-neon" />
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-neon">
              Preços
            </span>
          </div>

          <h2 className="mb-4 max-w-2xl font-display text-3xl font-bold uppercase leading-tight tracking-tight sm:text-4xl">
            Pague apenas quando <span className="text-neon">ganhar</span>.
          </h2>
          <p className="mb-12 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Não cobramos mensalidade. SongPIX é gratuito pra criar salas e receber músicas. Quando
            alguém usar o fura fila, você recebe o valor e a gente fica com uma pequena taxa de operação.
          </p>

          <div className="grid gap-px border border-border bg-border sm:grid-cols-2">
            <div className="bg-background p-8">
              <h3 className="font-display text-lg font-bold uppercase tracking-tight">Gratuito</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Crie salas ilimitadas, receba links de música e gerencie filas sem pagar nada.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Salas ilimitadas",
                  "Filas ilimitadas",
                  "Player integrado",
                  "Suporte YouTube, Spotify, SoundCloud",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-neon" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-background p-8">
              <h3 className="font-display text-lg font-bold uppercase tracking-tight">
                Fura Fila & Monetização
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Você define o valor mínimo do fura fila. Quanto mais o viewer paga, mais alto sobe na
                fila. Receba direto e monetize sua audiência.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Defina seu preço mínimo",
                  "Prioridade por valor pago",
                  "Painel de arrecadação em tempo real",
                  "Retirada simples e direta",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-neon" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-b border-border px-6 py-20 sm:px-12 lg:px-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 flex items-center gap-3">
            <div className="h-[2px] w-12 bg-neon" />
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-neon">
              Dúvidas
            </span>
          </div>

          <h2 className="mb-12 max-w-2xl font-display text-3xl font-bold uppercase leading-tight tracking-tight sm:text-4xl">
            Perguntas <span className="text-neon">frequentes</span>.
          </h2>

          <div className="grid gap-6 sm:grid-cols-2">
            {[
              {
                q: "Como o público envia músicas?",
                a: "Basta compartilhar o link da sua sala. O viewer acessa, cola o link do YouTube, Spotify ou SoundCloud e clica em enviar. Se quiser prioridade, paga o valor que achar justo.",
              },
              {
                q: "Posso usar em qualquer plataforma de live?",
                a: "Sim! SongPIX funciona com TikTok Live, YouTube, Twitch, Kick, Instagram Live ou qualquer outra. É só compartilhar o link da fila no chat ou bio.",
              },
              {
                q: "Quem define o preço do fura fila?",
                a: "Você! Ao criar a sala, define o valor mínimo. O viewer pode pagar exatamente isso ou mais, dependendo de quanto quer garantir a prioridade.",
              },
              {
                q: "É seguro? Meus dados estão protegidos?",
                a: "Totalmente. Usamos autenticação segura, Row Level Security no banco de dados e todas as transações são processadas com criptografia de ponta a ponta.",
              },
              {
                q: "Preciso instalar algum app?",
                a: "Não. SongPIX é 100% web. Tanto o criador quanto o viewer acessam pelo navegador, em qualquer dispositivo.",
              },
              {
                q: "Como eu recebo o dinheiro dos fura filas?",
                a: "Todas as arrecadações aparecem no seu painel em tempo real. A retirada é feita de forma simples e direta para a sua conta bancária cadastrada.",
              },
            ].map((faq, i) => (
              <div key={i} className="border border-border bg-background p-6">
                <h3 className="font-display text-sm font-bold uppercase tracking-tight">{faq.q}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="relative overflow-hidden border-b border-border px-6 py-24 sm:px-12 lg:px-24">
        <div
          className="pointer-events-none absolute inset-0 opacity-40 mix-blend-overlay"
          style={{
            backgroundImage: `url(${bgNoise})`,
            backgroundRepeat: "repeat",
            backgroundSize: "240px 240px",
          }}
        />
        <div className="relative mx-auto max-w-4xl text-center">
          <h2 className="font-display text-4xl font-bold uppercase leading-tight tracking-tight sm:text-5xl">
            Pronto pra <span className="text-neon">dominar</span> a sua live?
          </h2>
          <p className="mx-auto mt-6 max-w-lg text-base leading-relaxed text-muted-foreground">
            Crie sua sala agora, é gratuito. Em menos de um minuto você já pode compartilhar o link
            com seus viewers e começar a monetizar a interação.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 border border-neon bg-neon px-8 py-4 font-display text-xs font-bold uppercase tracking-widest text-neon-foreground transition-all hover:opacity-90"
            >
              Criar sala grátis <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/auth"
              className="border border-border px-8 py-4 font-display text-xs font-bold uppercase tracking-widest text-foreground transition-all hover:border-neon hover:text-neon"
            >
              Entrar na conta
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border bg-surface-2 px-6 py-12 sm:px-12">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col items-start justify-between gap-8 sm:flex-row">
            <div>
              <div className="flex items-center gap-2">
                <div className="grid h-7 w-7 place-items-center bg-neon text-neon-foreground">
                  <ListMusic className="h-4 w-4" />
                </div>
                <span className="font-display text-lg font-bold italic uppercase tracking-tighter">
                  Song<span className="text-neon">PIX</span>
                </span>
              </div>
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
                A fila de músicas interativa pra quem vive ao vivo. Criada por criadores, pra
                criadores.
              </p>
            </div>

            <div className="flex flex-wrap gap-8">
              <div>
                <h4 className="font-display text-xs font-bold uppercase tracking-widest">
                  Produto
                </h4>
                <ul className="mt-3 space-y-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  <li>
                    <Link to="/auth" className="hover:text-neon">
                      Criar sala
                    </Link>
                  </li>
                  <li>
                    <Link to="/auth" className="hover:text-neon">
                      Como funciona
                    </Link>
                  </li>
                  <li>
                    <Link to="/auth" className="hover:text-neon">
                      Preços
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="font-display text-xs font-bold uppercase tracking-widest">
                  Suporte
                </h4>
                <ul className="mt-3 space-y-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  <li>
                    <Link to="/auth" className="hover:text-neon">
                      Central de ajuda
                    </Link>
                  </li>
                  <li>
                    <Link to="/auth" className="hover:text-neon">
                      Contato
                    </Link>
                  </li>
                  <li>
                    <Link to="/auth" className="hover:text-neon">
                      Status
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 sm:flex-row">
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              © 2026 SongPIX. Todos os direitos reservados.
            </span>
            <div className="flex gap-6 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="text-neon">●</span> YouTube
              </span>
              <span className="flex items-center gap-1.5 opacity-60">
                <span className="text-muted-foreground">●</span> Spotify
              </span>
              <span className="flex items-center gap-1.5 opacity-60">
                <span className="text-muted-foreground">●</span> SoundCloud
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
