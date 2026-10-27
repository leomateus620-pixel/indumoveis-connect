import { memo, useId, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowRight, ChevronDown, X } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import type { NavCategory, NavDestination } from "@/lib/navigation";
import { PortalEmblem } from "./PortalEmblem";

type Props = {
  category: NavCategory;
  /** Somente os destinos que o perfil pode ler. */
  destinations: NavDestination[];
};

function CardContents({
  category,
  action,
  group,
}: {
  category: NavCategory;
  action: string;
  group?: boolean;
}) {
  return (
    <>
      <span className="portal-card__head">
        <PortalEmblem id={category.id} tone={category.tone} />
        <span className="portal-card__copy">
          <span className="portal-card__title">{category.title}</span>
          <span className="portal-card__desc">{category.description}</span>
        </span>
      </span>
      <span className="portal-card__foot" aria-hidden="true">
        <span className="portal-card__action">{action}</span>
        <span className={`portal-card__cue portal-card__cue--${group ? "toggle" : "go"}`}>
          {group ? <ChevronDown strokeWidth={2.25} /> : <ArrowRight strokeWidth={2.25} />}
        </span>
      </span>
    </>
  );
}

function DestinationLinks({
  category,
  destinations,
  onNavigate,
}: Props & { onNavigate: () => void }) {
  return (
    <ul className="portal-card__links" aria-label={`Destinos de ${category.title}`}>
      {destinations.map((destination) => (
        <li key={destination.to}>
          <Link
            to={destination.to}
            className="portal-card__link"
            onPointerDown={destination.prewarm}
            onFocus={destination.prewarm}
            onClick={onNavigate}
          >
            <span className="portal-card__link-icon" aria-hidden="true">
              <destination.icon strokeWidth={1.9} />
            </span>
            <span className="portal-card__link-label">{destination.label}</span>
            <ArrowRight className="portal-card__link-go" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export const PortalCategoryCard = memo(function PortalCategoryCard({
  category,
  destinations,
}: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const isMobile = useIsMobile();

  if (!destinations.length) return null;

  if (destinations.length === 1) {
    const [destination] = destinations;
    const only = category.destinations.length > 1 ? destination : undefined;
    return (
      <Link
        to={destination.to}
        className="portal-card portal-card__surface"
        data-kind="link"
        data-tone={category.tone}
        data-category={category.id}
        aria-label={`${destination.openLabel}: ${category.title}${only ? ` — ${destination.label}` : ""}`}
        onPointerDown={destination.prewarm}
        onFocus={destination.prewarm}
      >
        <CardContents category={category} action={destination.openLabel} />
      </Link>
    );
  }

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      className="portal-card portal-card__surface"
      data-kind="group"
      data-tone={category.tone}
      data-category={category.id}
      data-expanded={open || undefined}
      aria-label={`Ver ${destinations.length} opções de ${category.title}`}
    >
      <CardContents category={category} action={`Ver ${destinations.length} opções`} group />
    </button>
  );
  const links = (
    <DestinationLinks
      category={category}
      destinations={destinations}
      onNavigate={() => setOpen(false)}
    />
  );
  const focusDestination = (event: Event) => {
    event.preventDefault();
    if (event.target instanceof HTMLElement) {
      event.target.querySelector<HTMLElement>(".portal-card__link")?.focus({ preventScroll: true });
    }
  };
  // Mesmo ao fechar por clique externo, a seleção devolve o foco ao card de origem.
  const returnFocus = (event: Event) => {
    event.preventDefault();
    // Ao mudar de breakpoint, o seletor anterior desmonta depois que o novo já
    // recebeu foco. Sua limpeza não deve roubar o foco da nova apresentação.
    const currentSelector = triggerRef.current?.getAttribute("aria-controls");
    if (
      !currentSelector ||
      (event.target instanceof HTMLElement && currentSelector === event.target.id)
    ) {
      triggerRef.current?.focus({ preventScroll: true });
    }
  };
  const closeIcon = <X aria-hidden="true" />;

  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogPortal>
          <DialogOverlay className="portal-destinations__overlay" />
          <DialogPrimitive.Content
            className="portal-destinations portal-destinations--dialog"
            aria-modal="true"
            onOpenAutoFocus={focusDestination}
            onCloseAutoFocus={returnFocus}
          >
            <div className="portal-destinations__header">
              <DialogTitle className="portal-destinations__title">{category.title}</DialogTitle>
              <DialogDescription className="portal-destinations__description">
                Escolha a área que deseja acessar.
              </DialogDescription>
            </div>
            <DialogClose asChild>
              <button
                className="portal-destinations__close"
                type="button"
                aria-label="Fechar destinos"
              >
                {closeIcon}
              </button>
            </DialogClose>
            {links}
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className="portal-destinations portal-destinations--popover"
        align="start"
        sideOffset={8}
        collisionPadding={16}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onOpenAutoFocus={focusDestination}
        onCloseAutoFocus={returnFocus}
      >
        <div className="portal-destinations__header">
          <h3 id={titleId} className="portal-destinations__title">
            {category.title}
          </h3>
          <p id={descriptionId} className="portal-destinations__description">
            Escolha a área que deseja acessar.
          </p>
        </div>
        <button
          className="portal-destinations__close"
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Fechar destinos"
        >
          {closeIcon}
        </button>
        {links}
      </PopoverContent>
    </Popover>
  );
});
