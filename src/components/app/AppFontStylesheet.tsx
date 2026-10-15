import { useEffect, useRef, useState } from "react";

/** Keep the existing families, but never hold the authenticated map behind a font CDN. */
export function AppFontStylesheet() {
  const link = useRef<HTMLLinkElement>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    // The stylesheet may have completed between SSR and hydration.
    if (link.current?.sheet) setLoaded(true);
  }, []);
  return (
    <link
      ref={link}
      data-app-fonts
      rel="stylesheet"
      media={loaded ? "all" : "print"}
      href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap"
      onLoad={() => setLoaded(true)}
    />
  );
}
