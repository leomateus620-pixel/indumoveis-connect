import logoDark from "@/assets/logo-dark.png.asset.json";
import { BrandLoader } from "./BrandLoader";

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
      <p
        role="status"
        className="flex items-center gap-2.5 text-sm font-medium text-muted-foreground"
      >
        <BrandLoader className="size-6" />
        {label}…
      </p>
    </main>
  );
}
