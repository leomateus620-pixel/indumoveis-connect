import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouterState } from "@tanstack/react-router";
import { ArrowRight, Layers3, ShoppingCart, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEdition, useMe } from "@/lib/api";
import type { CommercialLot } from "@/lib/commercial";
import { area, brl } from "@/lib/format";
import { SaleModeContext } from "./sale-mode-context";
import { saleLotProblem, saleSegmentLabel, saleSelectionTotals } from "./selection";
import { GuidedSaleCheckout } from "./GuidedSaleCheckout";
import { GuidedSaleDetails } from "./GuidedSaleDetails";
import { SaleDialog } from "./SaleDialog";
import "./guided-sales.css";

export function CommercialSaleModeProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const me = useMe(userId);
  const edition = useEdition();
  const canUse =
    me.data?.id === userId &&
    me.data.roles.includes("admin") &&
    !!edition.data?.is_active &&
    !edition.data.is_historical;
  return (
    <SaleSession
      scope={`${userId}:${edition.data?.id ?? ""}:${canUse}`}
      canUse={canUse}
      editionId={edition.data?.id}
      editionTimezone={edition.data?.timezone}
    >
      {children}
    </SaleSession>
  );
}

function SaleSession({
  scope,
  canUse,
  editionId,
  editionTimezone,
  children,
}: {
  scope: string;
  canUse: boolean;
  editionId?: string;
  editionTimezone?: string;
  children: ReactNode;
}) {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const isMap = path === "/mapa" || path.startsWith("/mapa/");
  const [mode, setMode] = useState(false);
  const [lots, setLots] = useState<CommercialLot[]>([]);
  const lotsRef = useRef(lots);
  const [notice, setNotice] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [replacement, setReplacement] = useState<CommercialLot>();
  const [dealId, setDealId] = useState<string>();
  const [fullscreenHost, setFullscreenHost] = useState<Element | null>(null);
  const [sessionScope, setSessionScope] = useState(scope);
  const sameSession = sessionScope === scope;
  const active = canUse && isMap && mode && sameSession;

  useEffect(() => {
    const update = () => setFullscreenHost(document.fullscreenElement);
    document.addEventListener("fullscreenchange", update);
    update();
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  function replaceLots(next: CommercialLot[]) {
    lotsRef.current = next;
    setLots(next);
  }

  function clearMode() {
    replaceLots([]);
    setMode(false);
    setNotice("");
    setCartOpen(false);
    setCheckoutOpen(false);
    setDiscard(false);
    setReplacement(undefined);
  }

  useEffect(() => {
    if (isMap && sameSession) return;
    lotsRef.current = [];
    setMode(false);
    setLots([]);
    setNotice("");
    setCartOpen(false);
    setCheckoutOpen(false);
    setDiscard(false);
    setReplacement(undefined);
    if (!sameSession) {
      setDealId(undefined);
      setSessionScope(scope);
    }
  }, [isMap, sameSession, scope]);

  function toggleMode() {
    if (!canUse || !isMap) return;
    if (!active) setMode(true);
    else if (lotsRef.current.length) setDiscard(true);
    else clearMode();
  }

  function removeLot(id: string) {
    replaceLots(lotsRef.current.filter((lot) => lot.id !== id));
    setNotice("");
  }

  function toggleLot(lot: CommercialLot) {
    if (!active) return false;
    if (lotsRef.current.some((item) => item.id === lot.id)) removeLot(lot.id);
    else {
      const problem = saleLotProblem(lot);
      if (problem) setNotice(problem);
      else if (lotsRef.current[0] && lotsRef.current[0].segmentKey !== lot.segmentKey)
        setReplacement(lot);
      else {
        replaceLots([...lotsRef.current, lot]);
        setNotice("");
      }
    }
    return true;
  }

  const selectedIds = useMemo(
    () => new Set(active ? lots.map((lot) => lot.id) : []),
    [active, lots],
  );
  const value = {
    canUse,
    active,
    selectedIds,
    toggleMode,
    toggleLot,
    resumeSale: (id: string) => {
      if (canUse) setDealId(id);
    },
  };
  const totals = saleSelectionTotals(lots);
  const openCheckout = () => {
    setCartOpen(false);
    setCheckoutOpen(true);
  };
  const overlay = active && !checkoutOpen && (
    <div className="guided-sales-overlay">
      <aside className="guided-cart" aria-label="Seleção da comercialização">
        <CartContents
          lots={lots}
          notice={notice}
          onRemove={removeLot}
          onExit={toggleMode}
          onReview={openCheckout}
        />
      </aside>
      <div className="guided-mobile" aria-live="polite">
        {notice && (
          <p className="guided-map-notice" role="status">
            {notice}
          </p>
        )}
        <button type="button" className="guided-mobile-bar" onClick={() => setCartOpen(true)}>
          <ShoppingCart aria-hidden="true" />
          <span>
            <strong>
              {lots.length
                ? `${lots.length} ${lots.length === 1 ? "lote selecionado" : "lotes selecionados"}`
                : "Modo comercialização"}
            </strong>
            <small>
              {lots.length
                ? `${area(totals.areaM2)} · ${totals.pricedCount ? brl(totals.tableCents) : "Valor a definir"}`
                : "Selecione os lotes no mapa"}
            </small>
          </span>
          <ArrowRight aria-hidden="true" />
        </button>
      </div>
    </div>
  );
  return (
    <SaleModeContext.Provider value={value}>
      {children}
      {fullscreenHost && overlay ? createPortal(overlay, fullscreenHost) : overlay}
      {active && cartOpen && (
        <SaleDialog
          title="Seleção da comercialização"
          description="Confira os espaços selecionados."
          host={fullscreenHost}
          mobileSheet
          onClose={() => setCartOpen(false)}
        >
          <CartContents
            lots={lots}
            notice={notice}
            onRemove={removeLot}
            onExit={() => {
              setCartOpen(false);
              toggleMode();
            }}
            onReview={openCheckout}
            embedded
          />
        </SaleDialog>
      )}
      {active && discard && (
        <SaleDialog
          title="Sair da comercialização?"
          description="Os lotes selecionados serão removidos da seleção atual."
          host={fullscreenHost}
          onClose={() => setDiscard(false)}
        >
          <div className="guided-dialog-footer">
            <Button variant="outline" onClick={() => setDiscard(false)}>
              Continuar seleção
            </Button>
            <Button onClick={clearMode}>Sair do modo</Button>
          </div>
        </SaleDialog>
      )}
      {active && replacement && (
        <SaleDialog
          title="Trocar área da seleção?"
          description={`Para selecionar o lote ${replacement.code} de ${saleSegmentLabel(replacement.segmentKey)}, substitua os lotes da área atual.`}
          host={fullscreenHost}
          onClose={() => setReplacement(undefined)}
        >
          <div className="guided-dialog-footer">
            <Button variant="outline" onClick={() => setReplacement(undefined)}>
              Manter seleção
            </Button>
            <Button
              onClick={() => {
                replaceLots([replacement]);
                setNotice("");
                setReplacement(undefined);
              }}
            >
              Trocar área
            </Button>
          </div>
        </SaleDialog>
      )}
      {active && checkoutOpen && editionId && lots.length > 0 && (
        <GuidedSaleCheckout
          editionId={editionId}
          timezone={editionTimezone}
          lots={lots}
          host={fullscreenHost}
          onClose={() => setCheckoutOpen(false)}
          onSaved={(savedDealId) => {
            clearMode();
            setDealId(savedDealId);
          }}
        />
      )}
      {canUse && sameSession && dealId && (
        <GuidedSaleDetails
          key={dealId}
          dealId={dealId}
          host={fullscreenHost}
          timezone={editionTimezone}
          onClose={() => setDealId(undefined)}
        />
      )}
    </SaleModeContext.Provider>
  );
}

function CartContents({
  lots,
  notice,
  onRemove,
  onExit,
  onReview,
  embedded = false,
}: {
  lots: readonly CommercialLot[];
  notice: string;
  onRemove(id: string): void;
  onExit(): void;
  onReview(): void;
  embedded?: boolean;
}) {
  const totals = saleSelectionTotals(lots);
  return (
    <>
      {!embedded && (
        <header className="guided-cart-header">
          <span className="guided-icon">
            <ShoppingCart aria-hidden="true" />
          </span>
          <div>
            <h2>Comercialização</h2>
            <p>{lots[0] ? saleSegmentLabel(lots[0].segmentKey) : "Selecione os lotes no mapa"}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Sair do modo comercialização"
            onClick={onExit}
          >
            <X aria-hidden="true" />
          </Button>
        </header>
      )}
      {notice && (
        <p className="guided-map-notice" role="status">
          {notice}
        </p>
      )}
      {lots.length ? (
        <ul className="guided-cart-list">
          {lots.map((lot) => (
            <li key={lot.id}>
              <span>
                <strong>Lote {lot.code}</strong>
                <small>{area(lot.areaM2)}</small>
              </span>
              <span>{lot.grossCents == null ? "A definir" : brl(lot.grossCents)}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remover lote ${lot.code}`}
                onClick={() => onRemove(lot.id)}
              >
                <X aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="guided-cart-empty">
          <Layers3 aria-hidden="true" />
          <p>Selecione um ou mais lotes disponíveis na mesma área para iniciar.</p>
        </div>
      )}
      {lots.length > 0 && (
        <dl className="guided-cart-totals" aria-live="polite">
          <div>
            <dt>Área selecionada</dt>
            <dd>{area(totals.areaM2)}</dd>
          </div>
          <div>
            <dt>Subtotal de tabela</dt>
            <dd>{totals.pricedCount ? brl(totals.tableCents) : "—"}</dd>
          </div>
          {totals.pricedCount < lots.length && (
            <small>{lots.length - totals.pricedCount} sem tarifa definida</small>
          )}
        </dl>
      )}
      <div className="guided-cart-actions">
        <Button type="button" disabled={!lots.length} onClick={onReview}>
          Continuar <ArrowRight aria-hidden="true" />
        </Button>
        {embedded && (
          <Button type="button" variant="ghost" onClick={onExit}>
            Sair do modo
          </Button>
        )}
      </div>
    </>
  );
}
