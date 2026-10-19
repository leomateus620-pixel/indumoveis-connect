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
        <path d={arch(-60, 132, 230, 260)} fill="oklch(0.83 0.018 90 / 0.09)" />
        <path
          d={arch(628, -88, 214, 330)}
          fill="none"
          stroke="oklch(1 0 0 / 0.11)"
          strokeWidth="1.25"
        />
        <path
          d={arch(662, -54, 146, 262)}
          fill="none"
          stroke="oklch(1 0 0 / 0.06)"
          strokeWidth="1"
        />
        <circle cx="604" cy="244" r="6" fill="var(--brand-red)" />
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
