import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommercialLot } from "@/lib/commercial";
import { CommercialSaleModeProvider } from "./CommercialSaleMode";
import { GuidedSaleCheckout } from "./GuidedSaleCheckout";
import { useCommercialSaleMode } from "./sale-mode-context";

const mocks = vi.hoisted(() => ({
  role: "admin",
  path: "/mapa",
  preview: vi.fn(),
  save: vi.fn(),
  upload: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({ useRouterState: () => mocks.path, Link: () => null }));
vi.mock("@/lib/api", async () => {
  const { useMutation } = await import("@tanstack/react-query");
  return {
    api: { previewGuidedSale: mocks.preview, saveGuidedSale: mocks.save },
    cancelGuidedSaleAttachment: mocks.cancel,
    uploadGuidedSaleAttachment: mocks.upload,
    useMe: () => ({ data: { id: "admin-1", roles: [mocks.role] } }),
    useEdition: () => ({ data: { id: "edition-1", is_active: true } }),
    useGuidedSale: () => ({ isPending: true }),
    useGuidedSaleCompanies: () => ({
      data: [{ id: "buyer-1", legal_name: "Empresa Demo", trade_name: "Demo", tax_id: null }],
    }),
    useDbMutation: (fn: () => Promise<unknown>, opts?: { onSuccess?: (r: unknown) => void }) => {
      return useMutation({ mutationFn: fn, onSuccess: opts?.onSuccess });
    },
  };
});
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const lot: CommercialLot = {
  id: "lot-15",
  code: "15",
  segmentKey: "external",
  environmentId: null,
  geometryId: "geometry-15",
  areaM2: 20,
  areaPending: false,
  status: "disponivel",
  pricingState: "priced",
  cornerState: "not_corner",
  grossCents: 50000,
};
const indoor: CommercialLot = {
  ...lot,
  id: "p12-16",
  code: "16",
  segmentKey: "p12",
  environmentId: "environment-16",
  geometryId: null,
};
const pending: CommercialLot = {
  ...lot,
  id: "lot-17",
  code: "17",
  cornerState: "pending",
  pricingState: "corner_pending",
};
const saleQuote = {
  editionId: "edition-1",
  segmentKey: "external",
  lots: [{ id: lot.id, code: lot.code, areaM2: lot.areaM2, agreedCents: 50000, priceReason: null }],
  areaM2: 20,
  grossCents: 50000,
  totalCents: 50000,
  schedule: [{ number: 1, dueOn: "2027-02-01", amountCents: 50000 }],
  policy: {
    version: 1,
    firstDueOn: "2027-02-01",
    lastDueOn: "2029-03-30",
    maxInstallments: 18,
    today: "2027-02-01",
  },
  quoteFingerprint: "quote-1",
};

async function enterReview() {
  fireEvent.change(screen.getByLabelText("Empresa *"), { target: { value: "buyer-1" } });
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  await screen.findByRole("heading", { name: "Valores e pagamento" });
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  await screen.findByRole("heading", { name: "Confira a comercialização" });
}

function wrapper(children: React.ReactNode) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

function MapTest() {
  const mode = useCommercialSaleMode();
  return (
    <>
      {mode?.canUse && <button onClick={mode.toggleMode}>Ativar</button>}
      <button onClick={() => mode?.toggleLot(lot)}>15 externo</button>
      <button onClick={() => mode?.toggleLot(indoor)}>16 interno</button>
      <button onClick={() => mode?.toggleLot(pending)}>17 pendente</button>
      <output>{[...(mode?.selectedIds ?? [])].join(",")}</output>
    </>
  );
}

beforeEach(() => {
  mocks.role = "admin";
  mocks.path = "/mapa";
  mocks.preview.mockReset().mockResolvedValue(saleQuote);
  mocks.save.mockReset();
  mocks.cancel.mockReset().mockResolvedValue(null);
  mocks.upload.mockReset().mockResolvedValue({ id: "attachment-1", storage_path: "private.pdf" });
});

describe("modo comercialização", () => {
  it("requires explicit activation, blocks pending lots and confirms a change of area", () => {
    render(
      wrapper(
        <CommercialSaleModeProvider userId="admin-1">
          <MapTest />
        </CommercialSaleModeProvider>,
      ),
    );
    fireEvent.click(screen.getByText("15 externo"));
    expect(screen.queryByLabelText("Remover lote 15")).toBeNull();
    fireEvent.click(screen.getByText("Ativar"));
    fireEvent.click(screen.getByText("17 pendente"));
    expect(screen.getAllByText(/aguarda a classificação/i).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("15 externo"));
    fireEvent.click(screen.getByText("16 interno"));
    const dialog = screen.getByRole("dialog", { name: "Trocar área da seleção?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Trocar área" }));
    expect(screen.queryByLabelText("Remover lote 15")).toBeNull();
    expect(screen.getByLabelText("Remover lote 16")).toBeInTheDocument();
  });

  it("does not offer activation to non-admins", () => {
    mocks.role = "comercial";
    render(
      wrapper(
        <CommercialSaleModeProvider userId="admin-1">
          <MapTest />
        </CommercialSaleModeProvider>,
      ),
    );
    expect(screen.queryByRole("button", { name: "Ativar" })).toBeNull();
  });

  it("clears the selection when leaving map routes or losing the admin role", () => {
    const element = () =>
      wrapper(
        <CommercialSaleModeProvider userId="admin-1">
          <MapTest />
        </CommercialSaleModeProvider>,
      );
    const view = render(element());
    fireEvent.click(screen.getByText("Ativar"));
    fireEvent.click(screen.getByText("15 externo"));
    expect(screen.getByLabelText("Remover lote 15")).toBeInTheDocument();
    mocks.path = "/dashboard";
    view.rerender(element());
    mocks.path = "/mapa";
    view.rerender(element());
    expect(screen.queryByLabelText("Remover lote 15")).toBeNull();
    fireEvent.click(screen.getByText("Ativar"));
    fireEvent.click(screen.getByText("15 externo"));
    mocks.role = "financeiro";
    view.rerender(element());
    expect(screen.queryByLabelText("Remover lote 15")).toBeNull();
    expect(screen.queryByRole("button", { name: "Ativar" })).toBeNull();
  });

  it("does not submit on review and retries an uncertain confirmation with the same key", async () => {
    mocks.save
      .mockRejectedValueOnce(new TypeError("Conexão interrompida"))
      .mockResolvedValueOnce({ dealId: "deal-1", status: "reservada" });
    const onSaved = vi.fn();
    render(
      wrapper(
        <GuidedSaleCheckout
          editionId="edition-1"
          lots={[lot]}
          onClose={vi.fn()}
          onSaved={onSaved}
        />,
      ),
    );
    await enterReview();
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reservar lotes" }));
    await screen.findByRole("button", { name: "Verificar resultado" });
    fireEvent.click(screen.getByRole("button", { name: "Verificar resultado" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("deal-1"));
    expect(mocks.save.mock.calls[0][0]).toEqual(mocks.save.mock.calls[1][0]);
    expect(mocks.save.mock.calls[0][0]).toMatchObject({
      spaceIds: [lot.id],
      companyId: "buyer-1",
      signatureNote: null,
      quoteFingerprint: "quote-1",
    });
  });

  it("requires the signed PDF and attestation before completing a sale", async () => {
    mocks.save.mockResolvedValue({ dealId: "deal-1", status: "contratada" });
    render(
      wrapper(
        <GuidedSaleCheckout
          editionId="edition-1"
          lots={[lot]}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />,
      ),
    );
    await enterReview();
    fireEvent.click(screen.getByRole("checkbox", { name: /assinaturas.*verificadas/i }));
    fireEvent.change(screen.getByLabelText(/Registro da assinatura/), {
      target: { value: "Contrato recebido e conferido" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar venda" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Anexe o PDF assinado");
    expect(mocks.save).not.toHaveBeenCalled();
    const file = new File(["%PDF-"], "contrato.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Anexar contrato em PDF"), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar venda" }));
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith(
        expect.objectContaining({
          signatureNote: "Contrato recebido e conferido",
          attachmentId: "attachment-1",
        }),
      ),
    );
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it("cancels an unfinished staged upload when navigation unmounts the checkout", async () => {
    let resolveUpload!: (value: { id: string; storage_path: string }) => void;
    mocks.upload.mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );
    const view = render(
      wrapper(
        <GuidedSaleCheckout
          editionId="edition-1"
          lots={[lot]}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />,
      ),
    );
    await enterReview();
    fireEvent.change(screen.getByLabelText("Anexar contrato em PDF"), {
      target: { files: [new File(["%PDF-"], "contrato.pdf")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reservar lotes" }));
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    view.unmount();
    await act(async () => resolveUpload({ id: "staged", storage_path: "staged.pdf" }));
    expect(mocks.cancel).toHaveBeenCalledWith({ id: "staged", storage_path: "staged.pdf" });
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
