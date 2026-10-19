import type { ReactNode } from "react";
import type { NavCategoryId, NavTone } from "@/lib/navigation";

/*
 * Emblemas do portal. Grade 40×40, traço 2px com pontas arredondadas (`--emblem-ink`),
 * um acento em cor cheia (`--emblem-accent`) e, ao fundo, o arco da marca (`--emblem-arch`).
 */

const SYMBOLS: Record<NavCategoryId, ReactNode> = {
  agenda: (
    <>
      <rect x="8.5" y="11" width="23" height="20.5" rx="4" className="e-line" />
      <path d="M8.5 17.5h23M15 8v5.5M25 8v5.5" className="e-line" />
      <circle cx="14.5" cy="22.5" r="1.25" className="e-dot" />
      <circle cx="20" cy="22.5" r="1.25" className="e-dot" />
      <circle cx="14.5" cy="27.5" r="1.25" className="e-dot" />
      <circle cx="20" cy="27.5" r="1.25" className="e-dot" />
      <rect x="23.25" y="20.75" width="5.5" height="8.5" rx="1.75" className="e-accent" />
    </>
  ),
  mapa: (
    <>
      <path d="M7.5 13.5 15 10.5l9 3 8.5-3v17l-8.5 3-9-3-7.5 3Z" className="e-line" />
      <path d="M15 10.5v17M24 13.5v17" className="e-line e-soft" />
      <path
        d="M27 23.5s-5.25-4.6-5.25-8.6a5.25 5.25 0 0 1 10.5 0c0 4-5.25 8.6-5.25 8.6Z"
        className="e-accent"
      />
      <circle cx="27" cy="14.8" r="1.9" className="e-knock" />
    </>
  ),
  empresas: (
    <>
      <path d="M8 16.5 11 10h18l3 6.5" className="e-line" />
      <path
        d="M8 16.5c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3Z"
        className="e-accent"
      />
      <path d="M10 19.5v12h20v-12" className="e-line" />
      <circle cx="20" cy="24" r="2.25" className="e-line" />
      <path d="M15.5 31.5c.4-2.6 2.2-4.2 4.5-4.2s4.1 1.6 4.5 4.2" className="e-line" />
    </>
  ),
  financeiro: (
    <>
      <path d="M7.5 31.5h25" className="e-line" />
      <rect x="9.5" y="24" width="4.5" height="7.5" rx="1.25" className="e-line" />
      <rect x="16.5" y="19.5" width="4.5" height="12" rx="1.25" className="e-line" />
      <rect x="23.5" y="22" width="4.5" height="9.5" rx="1.25" className="e-line e-soft" />
      <circle cx="27.5" cy="12.5" r="5" className="e-accent" />
      <path d="M27.5 10v5M25.75 12.5h3.5" className="e-knock-line" />
      <path d="M10.5 18.5 16 14l4 2.5 3.5-3" className="e-line e-soft" />
    </>
  ),
  vistorias: (
    <>
      <rect x="9" y="10.5" width="17" height="21.5" rx="3" className="e-line" />
      <rect x="13.25" y="8" width="8.5" height="4.5" rx="1.5" className="e-fill" />
      <path d="m12.75 18.5 2 2 3.75-3.75M12.75 25.5h6" className="e-line" />
      <circle cx="27.5" cy="25" r="4.75" className="e-accent-line" />
      <path d="m31 28.5 2.5 2.5" className="e-accent-line" />
    </>
  ),
  administracao: (
    <>
      <rect x="7.5" y="9.5" width="25" height="21" rx="4" className="e-line" />
      <circle cx="11.5" cy="13.25" r="1" className="e-dot" />
      <circle cx="14.75" cy="13.25" r="1" className="e-dot" />
      <path d="M13.5 26a6.5 6.5 0 0 1 13 0" className="e-line" />
      <path d="M20 26l3.6-4.6" className="e-accent-line" />
      <circle cx="20" cy="26" r="1.75" className="e-accent" />
      <path d="M11 30.5h18" className="e-line e-soft" />
    </>
  ),
};

export function PortalEmblem({
  id,
  tone,
  size = "lg",
}: {
  id: NavCategoryId;
  tone: NavTone;
  size?: "lg" | "sm";
}) {
  return (
    <span className="portal-emblem" data-tone={tone} data-size={size} aria-hidden="true">
      <svg viewBox="0 0 40 40" focusable="false">
        <path className="e-arch" d="M10 40V24a10 10 0 0 1 20 0v16Z" />
        {SYMBOLS[id]}
      </svg>
    </span>
  );
}
