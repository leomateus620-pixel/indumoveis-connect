import { useId } from "react";
import { cn } from "@/lib/utils";

const ARCH = "M7 28V16a9 9 0 0 1 18 0v12Z";

/** Arco da marca preenchendo-se de baixo para cima: indicador de carregamento da Indumóveis. */
export function BrandLoader({
  className,
  tone = "plum",
}: {
  className?: string;
  tone?: "plum" | "light";
}) {
  const clip = useId();
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("brand-loader", tone === "light" && "brand-loader--light", className)}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id={clip}>
          <path d={ARCH} />
        </clipPath>
      </defs>
      <path className="brand-loader__track" d={ARCH} />
      <g clipPath={`url(#${clip})`}>
        <rect className="brand-loader__fill" x="6" y="6" width="20" height="23" />
      </g>
      <circle className="brand-loader__dot" cx="25.5" cy="8.5" r="2.5" />
    </svg>
  );
}
