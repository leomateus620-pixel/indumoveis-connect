import type { ReactNode } from "react";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCommercialSaleMode } from "./sale-mode-context";

export function ResumeGuidedSaleButton({
  dealId,
  children = "Ver comercialização",
  className,
}: {
  dealId: string;
  children?: ReactNode;
  className?: string;
}) {
  const saleMode = useCommercialSaleMode();
  if (!saleMode?.canUse) return null;
  return (
    <Button
      type="button"
      variant="outline"
      className={className}
      onClick={() => saleMode.resumeSale(dealId)}
    >
      <ClipboardCheck aria-hidden="true" />
      {children}
    </Button>
  );
}
