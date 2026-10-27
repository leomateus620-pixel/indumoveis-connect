import { memo, useEffect, useId, useRef, useState } from "react";
import logoLight from "@/assets/logo-light.png.asset.json";

/** Letreiro oficial sem o arco translúcido, integrado à sala e lido de baixo para cima. */
export const PortalHero = memo(function PortalHero({ year }: { year?: number }) {
  const filterId = useId();
  const typography = useRef<HTMLLinkElement>(null);
  const [fontReady, setFontReady] = useState(false);
  useEffect(() => {
    if (typography.current?.sheet) setFontReady(true);
  }, []);
  return (
    <div className="portal-hero">
      <link
        ref={typography}
        rel="stylesheet"
        media={fontReady ? "all" : "print"}
        href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@1,600&display=swap&text=sonhos%2Cneg%C3%B3cios"
        onLoad={() => setFontReady(true)}
      />
      <svg className="portal-hero__filters" aria-hidden="true" focusable="false">
        <defs>
          <filter id={filterId} colorInterpolationFilters="sRGB">
            {/* O arco tem alfa de ~20%; a tinta do letreiro permanece opaca. */}
            <feComponentTransfer>
              <feFuncA type="linear" slope="1.4" intercept="-0.4" />
            </feComponentTransfer>
          </filter>
        </defs>
      </svg>
      <div className="portal-hero__brand">
        <h1 id="portal-title" className="sr-only">
          Portal Indumóveis{year ? ` ${year}` : ""}
        </h1>
        <div className="portal-hero__logo-slot">
          <div className="portal-hero__lockup">
            <span className="portal-hero__wordmark">
              <img
                className="portal-hero__logo"
                src={logoLight.url}
                width={1452}
                height={372}
                alt="Indumóveis"
                style={{ filter: `url(#${filterId})` }}
                decoding="async"
                fetchPriority="high"
                draggable={false}
              />
            </span>
            {year && <span className="portal-hero__year">{year}</span>}
          </div>
        </div>
      </div>
      <p className="portal-hero__tagline">
        <span>
          Inspiramos <em>sonhos,</em>
        </span>{" "}
        <span>
          impulsionamos <em>negócios</em>
        </span>
      </p>
    </div>
  );
});
