import { memo } from "react";
import logoLight from "@/assets/logo-light.png.asset.json";

const LOGO_WIDTH = 1452;
const LOGO_HEIGHT = 372;

// Arco com topo semicircular: a mesma forma do arco presente na marca.
function arch(x: number, y: number, w: number, h: number) {
  const r = w / 2;
  return `M${x} ${y + h}V${y + r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h}Z`;
}

export const PortalHero = memo(function PortalHero() {
  return (
    <section className="portal-hero" aria-labelledby="portal-hero-title">
      <svg
        className="portal-hero__decor"
        viewBox="0 0 800 300"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
        focusable="false"
      >
        <path d={arch(-40, 168, 190, 200)} fill="oklch(0.83 0.018 90 / 0.08)" />
        <path
          d={arch(604, 92, 168, 240)}
          fill="none"
          stroke="oklch(1 0 0 / 0.12)"
          strokeWidth="1.25"
        />
        <path
          d={arch(632, 136, 112, 200)}
          fill="none"
          stroke="oklch(1 0 0 / 0.07)"
          strokeWidth="1"
        />
        <circle cx="688" cy="66" r="5.5" fill="var(--brand-red)" />
      </svg>
      <div className="portal-hero__brand">
        <h1 id="portal-hero-title" className="sr-only">
          Portal Indumóveis 2027
        </h1>
        <img
          className="portal-hero__logo"
          src={logoLight.url}
          width={LOGO_WIDTH}
          height={LOGO_HEIGHT}
          alt="Indumóveis 2027"
          decoding="async"
          fetchPriority="high"
          draggable={false}
        />
        <p className="portal-hero__tagline">Inspiramos sonhos, impulsionamos negócios</p>
      </div>
    </section>
  );
});
