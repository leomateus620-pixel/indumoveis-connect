import { Loader2 } from "lucide-react";
import logoDark from "@/assets/logo-dark.png.asset.json";

/** Superfície neutra enquanto sessão/perfil são verificados: nada protegido é renderizado. */
export function BootScreen({ label = "Verificando sessão" }: { label?: string }) {
  return (
    <main
      className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-workspace px-6"
      aria-busy="true"
    >
      <img
        src={logoDark.url}
        width={1452}
        height={372}
        alt="Indumóveis 2027"
        className="h-auto w-44 opacity-90"
        decoding="async"
      />
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        {label}…
      </p>
    </main>
  );
}
