import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errMsg } from "@/lib/format";
import logoLight from "@/assets/logo-light.png.asset.json";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Sistema Indumóveis" },
      { name: "description", content: "Acesso restrito às equipes da Indumóveis." },
      { property: "og:title", content: "Entrar — Sistema Indumóveis" },
      { property: "og:description", content: "Acesso restrito às equipes da Indumóveis." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "err" | "ok"; text: string } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) navigate({ to: "/dashboard" });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: name } },
        });
        if (error) throw error;
        if (!data.session)
          setMsg({
            type: "ok",
            text: "Conta criada. Confirme pelo link enviado ao seu e-mail para entrar.",
          });
      }
    } catch (err) {
      setMsg({ type: "err", text: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/auth",
    });
    if (r.error) setMsg({ type: "err", text: errMsg(r.error) });
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between">
        {/* elementos geométricos da marca, apenas aqui */}
        <div
          className="absolute -right-32 top-40 h-40 w-[26rem] rotate-[35deg] bg-brand-taupe/45"
          aria-hidden
        />
        <div
          className="absolute -right-32 top-40 h-40 w-[26rem] -rotate-[35deg] bg-brand-taupe/45"
          aria-hidden
        />
        <div
          className="absolute right-24 top-[17.5rem] size-20 rounded-full bg-brand-red"
          aria-hidden
        />
        <div className="absolute bottom-0 left-0 h-24 w-56 bg-brand-red" aria-hidden />
        <div className="relative">
          <img src={logoLight.url} alt="Indumóveis 2027" className="h-auto w-80" />
        </div>
        <p className="relative ml-60 max-w-xs font-display text-lg font-semibold leading-snug">
          Inspiramos sonhos, impulsionamos negócios
        </p>
      </aside>
      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 rounded-lg bg-sidebar p-5 lg:hidden">
            <img src={logoLight.url} alt="Indumóveis 2027" className="mx-auto w-56" />
          </div>
          <h1 className="text-2xl font-extrabold">
            {mode === "in" ? "Acessar o sistema" : "Criar acesso"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "in"
              ? "Use seu e-mail corporativo."
              : "Após criar a conta, a administração atribui seu perfil de acesso."}
          </p>
          <form onSubmit={submit} className="mt-6 space-y-3">
            {mode === "up" && (
              <div className="space-y-1">
                <label htmlFor="name" className="text-sm font-medium">
                  Nome completo
                </label>
                <Input
                  id="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                />
              </div>
            )}
            <div className="space-y-1">
              <label htmlFor="email" className="text-sm font-medium">
                E-mail
              </label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="pw" className="text-sm font-medium">
                Senha
              </label>
              <Input
                id="pw"
                type="password"
                required
                minLength={8}
                autoComplete={mode === "in" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {msg && (
              <p
                role="alert"
                className={msg.type === "err" ? "text-sm text-destructive" : "text-sm text-success"}
              >
                {msg.text}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {mode === "in" ? "Entrar" : "Criar conta"}
            </Button>
          </form>
          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            ou
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button variant="outline" className="w-full" onClick={google}>
            Continuar com Google
          </Button>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "in" ? "Ainda não tem acesso?" : "Já possui conta?"}{" "}
            <button
              type="button"
              className="font-semibold text-primary underline-offset-4 hover:underline"
              onClick={() => {
                setMode(mode === "in" ? "up" : "in");
                setMsg(null);
              }}
            >
              {mode === "in" ? "Criar conta" : "Entrar"}
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}
