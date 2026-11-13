import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function SaleDialog({
  title,
  description,
  host,
  busy,
  mobileSheet,
  children,
  onClose,
}: {
  title: string;
  description: string;
  host?: Element | null;
  busy?: boolean;
  mobileSheet?: boolean;
  children: ReactNode;
  onClose(): void;
}) {
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <Dialog.Portal container={host as HTMLElement | null | undefined}>
        <Dialog.Overlay className="guided-dialog-overlay" />
        <Dialog.Content
          className={`guided-dialog${mobileSheet ? " guided-dialog-sheet" : ""}`}
          onInteractOutside={(event) => event.preventDefault()}
          onOpenAutoFocus={() => {
            if (document.activeElement instanceof HTMLElement)
              returnFocus.current = document.activeElement;
          }}
          onCloseAutoFocus={(event) => {
            if (returnFocus.current?.isConnected) {
              event.preventDefault();
              returnFocus.current.focus();
            }
          }}
        >
          <header className="guided-dialog-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>{description}</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Fechar" disabled={busy}>
                <X aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </header>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
