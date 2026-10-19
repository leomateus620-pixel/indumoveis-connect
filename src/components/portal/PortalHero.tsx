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
    <div className="portal-hero">
      <svg
        className="portal-hero__decor"
        viewBox="0 0 1200 420"
        preserveAspectRatio="xMidYMax slice"
        aria-hidden="true"
        focusable="false"
      >
        <path d={arch(-60, 210, 260, 260)} fill="oklch(1 0 0 / 0.045)" />
        <path
          d={arch(-20, 250, 180, 220)}
          fill="none"
          stroke="oklch(1 0 0 / 0.08)"
          strokeWidth="1.25"
        />
        <path d={arch(960, 120, 240, 340)} fill="oklch(1 0 0 / 0.04)" />
        <path
          d={arch(1000, 170, 160, 300)}
          fill="none"
          stroke="oklch(1 0 0 / 0.1)"
          strokeWidth="1.25"
        />
        <circle cx="1080" cy="236" r="7" fill="var(--brand-red)" />
        <circle cx="170" cy="168" r="3.5" fill="oklch(1 0 0 / 0.28)" />
      </svg>
      <div className="portal-hero__brand">
        <h1 id="portal-title" className="sr-only">
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
    </div>
  );
});
