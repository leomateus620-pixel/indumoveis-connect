import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMe } from "@/lib/api";
import logoLight from "@/assets/logo-light.png.asset.json";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [
    { title: "Entrar — Sistema Indumóveis" },
    { name: "description", content: "Acesso às equipes da Indumóveis." },
    { property: "og:title", content: "Entrar — Sistema Indumóveis" },
    { property: "og:description", content: "Acesso às equipes da Indumóveis." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: AuthPage,
});

const allowed = ["/dashboard", "/mapa", "/comercializacao", "/empresas", "/contratos", "/vistorias", "/financeiro", "/agenda", "/documentos", "/admin"] as const;
const detailPaths = ["/empresas", "/contratos", "/vistorias"] as const;
const moduleFor: Record<string, string> = { "/dashboard": "dashboard", "/mapa": "mapa", "/comercializacao": "comercial", "/empresas": "empresas", "/contratos": "contratos", "/vistorias": "vistorias", "/financeiro": "financeiro", "/agenda": "agenda", "/documentos": "documentos", "/admin": "admin" };
function safeDestination(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    const root = allowed.find((p) => url.pathname === p || (detailPaths.some((d) => d === p) && new RegExp(`^${p}/[a-zA-Z0-9-]+/?$`).test(url.pathname)));
    return root ? { path: url.pathname + url.search, module: moduleFor[root] } : null;
  } catch { return null; }
}

function AuthPage() {
  const { data: user, isPending, isError, refetch } = useQuery({
    queryKey: ["auth", "session"],
    queryFn: async () => {
      const { data: stored, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!stored.session) return null;
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user;
    },
    retry: 1,
  });
  if (isPending) return <Status title="Verificando sessão" />;
  if (isError) return <Status title="Não foi possível verificar sua sessão" action={<><Button onClick={() => refetch()}>Tentar novamente</Button><SignOut /></>} />;
  return user ? <ResolveAccess userId={user.id} /> : <AuthForm />;
}

function ResolveAccess({ userId }: { userId: string }) {
  const { data: me, isPending, isError, refetch } = useMe(userId);
  const navigate = useNavigate();
  useEffect(() => {
    if (!me || !me.roles.length) return;
    const requested = safeDestination(new URLSearchParams(window.location.search).get("redirect") ?? sessionStorage.getItem("auth-redirect"));
    sessionStorage.removeItem("auth-redirect");
    const target = requested && me.perms[requested.module]?.read ? requested.path : (allowed.find((p) => me.perms[moduleFor[p]]?.read) ?? "/auth");
    navigate({ to: target as "/dashboard", replace: true });
  }, [me, navigate]);
  if (isPending) return <Status title="Carregando seu perfil" />;
  if (isError || !me) return <Status title="Não foi possível consultar seu acesso" detail="Sua sessão permanece ativa." action={<><Button onClick={() => refetch()}>Tentar novamente</Button><SignOut /></>} />;
  if (!me.roles.length) return <Status title="Acesso aguardando liberação" detail="Sua conta ainda não possui um perfil autorizado. Solicite à administração a liberação do acesso." action={<><Button variant="outline" onClick={() => refetch()}>Verificar acesso</Button><SignOut /></>} />;
  return <Status title="Preparando seu acesso" />;
}

function SignOut() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return <Button variant="outline" onClick={async () => { await queryClient.cancelQueries(); queryClient.clear(); await supabase.auth.signOut(); queryClient.setQueryData(["auth", "session"], null); navigate({ to: "/auth", replace: true }); }}>Sair</Button>;
}
function Status({ title, detail, action }: { title: string; detail?: string; action?: React.ReactNode }) {
  return <main className="flex min-h-screen items-center justify-center px-6"><div className="max-w-sm space-y-4 text-center"><h1 className="font-display text-xl font-bold">{title}</h1>{detail && <p className="text-muted-foreground">{detail}</p>}<div className="flex justify-center gap-3">{action}</div></div></main>;
}

function AuthForm() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<"email" | "google" | null>(null);
  const [error, setError] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const dest = safeDestination(new URLSearchParams(window.location.search).get("redirect"));
    if (dest) sessionStorage.setItem("auth-redirect", dest.path);
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const issues: Record<string, string> = {};
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) issues.email = "Informe um e-mail válido.";
    if (!password) issues.password = "Informe sua senha.";
    else if (mode === "up" && password.length < 6) issues.password = "A senha deve ter pelo menos 6 caracteres.";
    if (mode === "up" && !name.trim()) issues.name = "Informe seu nome completo.";
    setError(issues);
    if (Object.keys(issues).length) return;
    setBusy("email"); setNotice("");
    try {
      if (mode === "in") {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) {
          const notConfirmed = (authError as { code?: string }).code === "email_not_confirmed";
          setError(notConfirmed
            ? { email: "Seu e-mail ainda não foi confirmado. Abra o link enviado para sua caixa de entrada." }
            : { password: "Não foi possível entrar. Confira e-mail e senha." });
          return;
        }
      } else {
        const { data, error: authError } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin + "/auth", data: { full_name: name.trim() } } });
        if (authError) { setError({ email: "Não foi possível criar a conta. Verifique os dados e tente novamente." }); return; }
        if (!data.session) setNotice("Conta solicitada. Confira seu e-mail para confirmar o cadastro; o acesso aos módulos depende de um perfil autorizado.");
      }
    } catch { setError({ form: "Não foi possível concluir a solicitação. Tente novamente." }); }
    finally { setBusy(null); }
  }
  async function google() {
    if (busy) return;
    setBusy("google"); setError({}); setNotice("");
    try {
      const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
      if (result.error) setError({ form: "Não foi possível entrar com Google. Tente novamente." });
      else if (!result.redirected && !("tokens" in result)) setError({ form: "O acesso com Google foi cancelado ou não pôde ser concluído. Tente novamente." });
    } catch { setError({ form: "Não foi possível entrar com Google. Tente novamente." }); }
    finally { setBusy(null); }
  }
  return <div className="grid min-h-screen lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
    <aside className="relative hidden overflow-hidden bg-sidebar text-sidebar-foreground lg:flex lg:flex-col lg:justify-between p-10 xl:p-14">
      <img src={logoLight.url} alt="Indumóveis 2027" className="relative z-10 w-56 h-auto xl:w-64" />
      <div className="absolute right-0 top-[20%] size-52 rotate-45 bg-brand-taupe/40" aria-hidden />
      <div className="absolute right-24 top-[28%] size-12 rounded-full bg-brand-red" aria-hidden />
      <p className="relative max-w-xs font-display text-lg font-semibold leading-relaxed">Inspiramos sonhos,<br /> impulsionamos negócios</p>
    </aside>
    <main className="flex items-center justify-center px-6 py-12 sm:px-10 lg:px-16">
      <div className="w-full max-w-[430px]">
        <div className="mb-10 flex h-24 items-center justify-center rounded-md bg-sidebar lg:hidden"><img src={logoLight.url} alt="Indumóveis 2027" className="w-52 h-auto" /></div>
        <h1 className="font-display text-[1.65rem] font-bold leading-tight">{mode === "in" ? "Acessar o sistema" : "Criar acesso"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{mode === "in" ? "Entre com seu e-mail para continuar." : "Crie sua conta para solicitar acesso à equipe."}</p>
        <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
          {mode === "up" && <div><label htmlFor="auth-name" className="mb-1.5 block text-sm font-medium">Nome completo</label><Input id="auth-name" autoComplete="name" value={name} maxLength={120} aria-invalid={!!error.name} aria-describedby={error.name ? "name-error" : undefined} onChange={(e) => setName(e.target.value)} className="h-12" />{error.name && <p id="name-error" className="mt-1 text-sm text-destructive">{error.name}</p>}</div>}
          <div><label htmlFor="auth-email" className="mb-1.5 block text-sm font-medium">E-mail</label><Input id="auth-email" type="email" autoComplete="email" value={email} maxLength={254} aria-invalid={!!error.email} aria-describedby={error.email ? "email-error" : undefined} onChange={(e) => setEmail(e.target.value)} className="h-12" />{error.email && <p id="email-error" className="mt-1 text-sm text-destructive">{error.email}</p>}</div>
           <div><label htmlFor="auth-password" className="mb-1.5 block text-sm font-medium">Senha</label><div className="relative"><Input id="auth-password" type={showPassword ? "text" : "password"} autoComplete={mode === "in" ? "current-password" : "new-password"} value={password} minLength={mode === "up" ? 6 : undefined} aria-invalid={!!error.password} aria-describedby={error.password ? "password-error" : undefined} onChange={(e) => setPassword(e.target.value)} className="h-12 pr-12" /><Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 size-10" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff /> : <Eye />}</Button></div>{error.password && <p id="password-error" className="mt-1 text-sm text-destructive">{error.password}</p>}</div>
          {error.form && <p role="alert" className="text-sm text-destructive">{error.form}</p>}
          {notice && <p role="status" className="text-sm text-success">{notice}</p>}
          <Button type="submit" className="h-12 w-full" disabled={!!busy}>{busy === "email" && <Loader2 className="animate-spin" />}{mode === "in" ? "Entrar" : "Criar conta"}</Button>
        </form>
        <div className="my-6 flex items-center gap-4 text-sm text-muted-foreground"><span className="h-px flex-1 bg-border" />ou<span className="h-px flex-1 bg-border" /></div>
        <Button type="button" variant="outline" className="h-12 w-full" disabled={!!busy} onClick={google}>{busy === "google" ? <Loader2 className="animate-spin" /> : <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="text-primary"><path d="M21.35 11.1H12v3.8h5.35c-.23 1.24-.93 2.29-1.99 2.99v2.49h3.22c1.88-1.73 2.97-4.28 2.97-7.31 0-.66-.07-1.31-.2-1.97ZM12 22a9.95 9.95 0 0 0 6.58-2.42l-3.22-2.49c-.9.61-2.05.97-3.36.97a6.07 6.07 0 0 1-5.71-4.21H2.97v2.56A10 10 0 0 0 12 22ZM6.29 13.85a6.03 6.03 0 0 1 0-3.7V7.59H2.97a10 10 0 0 0 0 8.82l3.32-2.56ZM12 5.94c1.42 0 2.68.49 3.68 1.45l2.77-2.77A9.95 9.95 0 0 0 12 2a10 10 0 0 0-9.03 5.59l3.32 2.56A6.07 6.07 0 0 1 12 5.94Z" /></svg>}Continuar com Google</Button>
        <p className="mt-7 text-center text-sm text-muted-foreground">{mode === "in" ? "Ainda não tem acesso?" : "Já possui conta?"} <Button type="button" variant="link" className="h-auto px-1 py-0 font-semibold" disabled={!!busy} onClick={() => { setMode(mode === "in" ? "up" : "in"); setError({}); setNotice(""); }}>{mode === "in" ? "Criar conta" : "Entrar"}</Button></p>
      </div>
    </main>
  </div>;
}
