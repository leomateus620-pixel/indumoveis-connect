import { memo, useId, useState } from "react";
import officialLogo from "@/assets/logo-light.png.asset.json";

/** O recorte preserva o letreiro oficial; cada exibição acrescenta o ano da edição. */
export const PortalWordmark = memo(function PortalWordmark({
  presentation = false,
}: {
  presentation?: boolean;
}) {
  const filterId = useId();
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className={presentation ? "countdown-show__wordmark" : "portal-hero__wordmark"}>
        Indumóveis
      </span>
    );
  }
  return (
    <>
      <svg
        className="portal-hero__filters"
        width="0"
        height="0"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <filter id={filterId} colorInterpolationFilters="sRGB">
            {/* O arco tem alfa de ~20%; a tinta do letreiro permanece opaca. */}
            <feComponentTransfer>
              <feFuncA type="linear" slope="1.4" intercept="-0.4" />
            </feComponentTransfer>
          </filter>
        </defs>
      </svg>
      <span className={presentation ? "countdown-show__wordmark-crop" : "portal-hero__wordmark"}>
        <img
          className={presentation ? "countdown-show__logo" : "portal-hero__logo"}
          src={officialLogo.url}
          width={1452}
          height={372}
          alt="Indumóveis"
          style={{ filter: `url(#${filterId})` }}
          decoding="async"
          fetchPriority="high"
          draggable={false}
          onError={() => setFailed(true)}
        />
      </span>
    </>
  );
});
