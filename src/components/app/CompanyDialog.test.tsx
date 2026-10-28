import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompanyDialog } from "./CompanyDialog";

const backend = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/lib/api", () => ({
  api: { saveCompanyParticipation: backend.save },
  signedUrl: vi.fn(),
  useDbMutation: (
    save: () => Promise<unknown>,
    options: { onSuccess: (result: unknown) => void },
  ) => ({
    isPending: false,
    mutate: async (_: undefined, handlers: { onError: (error: unknown) => void }) => {
      try {
        options.onSuccess(await save());
      } catch (error) {
        handlers.onError(error);
      }
    },
  }),
}));
const edition = { id: "edition-2027", year: 2027 };
const company = {
  id: "company-1",
  legal_name: "Empresa Limitada",
  trade_name: "Empresa",
  tax_id: "12345678000199",
  tax_id_type: "cnpj",
  city: "Bento Gonçalves",
  state: "RS",
  updated_at: "2026-10-28T14:00:00Z",
};
const occupations = [
  { id: "occupation-1", area_label: "Pavilhão 01", module_codes: ["001", "002"], area_total: 36.5 },
];
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  backend.save.mockReset().mockResolvedValue({ company_id: company.id });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("company and participation atomic form", () => {
  it("creates one atomic company/participation payload and leaves absent data absent", async () => {
    const onSaved = vi.fn();
    render(<CompanyDialog open onOpenChange={vi.fn()} edition={edition} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("Nome fantasia *"), {
      target: { value: "Nova Empresa" },
    });
    fireEvent.change(screen.getByLabelText("Razão social *"), {
      target: { value: "Nova Empresa Ltda." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(backend.save).toHaveBeenCalledOnce());
    expect(onSaved).toHaveBeenCalledWith(company.id);
    expect(backend.save).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: null,
        editionId: edition.id,
        occupations: [],
        idempotencyKey: expect.any(String),
        company: expect.objectContaining({
          trade_name: "Nova Empresa",
          representative_name: null,
          email: null,
          phone: null,
          street: null,
          postal_code: null,
        }),
      }),
    );
  });

  it("reuses the same company without automatically copying historical occupations", async () => {
    render(
      <CompanyDialog
        open
        onOpenChange={vi.fn()}
        company={company}
        edition={edition}
        reuse
        previousOccupations={occupations}
        previousEditionName="2025"
      />,
    );
    expect(screen.getByText("Pavilhão 01")).toBeVisible();
    expect(screen.queryByLabelText("Área / pavilhão *")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reaproveitar ocupações para conferência" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Adicionar a 2027" }));
    await waitFor(() => expect(backend.save).toHaveBeenCalledOnce());
    expect(backend.save).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: company.id,
        editionId: edition.id,
        occupations: [],
        expectedCompanyUpdatedAt: company.updated_at,
      }),
    );
  });

  it("copies occupation drafts only after explicit correspondence confirmation and preserves row area", async () => {
    render(
      <CompanyDialog
        open
        onOpenChange={vi.fn()}
        company={company}
        edition={edition}
        reuse
        previousOccupations={occupations}
        previousEditionName="2025"
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /Conferi pavilhões/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Reaproveitar ocupações para conferência" }),
    );
    expect(screen.getByLabelText("Área / pavilhão *")).toHaveValue("Pavilhão 01");
    expect(screen.getByLabelText("Área total (m²) *")).toHaveValue("36.5");
    fireEvent.click(screen.getByRole("button", { name: "Adicionar a 2027" }));
    await waitFor(() => expect(backend.save).toHaveBeenCalledOnce());
    expect(backend.save).toHaveBeenCalledWith(
      expect.objectContaining({
        occupations: [
          { area_label: "Pavilhão 01", module_codes: ["001", "002"], area_total: 36.5 },
        ],
      }),
    );
  });

  it("keeps the editing session version on refetch and preserves immutable historical occupations", async () => {
    const participation = { version: 2, snapshot_locked: true };
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <CompanyDialog
        open
        onOpenChange={onOpenChange}
        company={company}
        edition={edition}
        participation={participation}
        occupations={occupations}
      />,
    );
    fireEvent.change(screen.getByLabelText("Município"), { target: { value: "Caxias do Sul" } });
    rerender(
      <CompanyDialog
        open
        onOpenChange={onOpenChange}
        company={{ ...company, updated_at: "2026-10-28T15:00:00Z", city: "Porto Alegre" }}
        edition={edition}
        participation={{ ...participation, version: 3 }}
        occupations={occupations}
      />,
    );
    expect(screen.getByLabelText("Município")).toHaveValue("Caxias do Sul");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(backend.save).toHaveBeenCalledOnce());
    expect(backend.save).toHaveBeenCalledWith(
      expect.objectContaining({
        occupations: null,
        expectedCompanyUpdatedAt: company.updated_at,
        expectedParticipationVersion: 2,
        company: expect.objectContaining({ city: "Caxias do Sul" }),
      }),
    );
  });

  it("shows server conflicts and keeps the same idempotency key for a retry", async () => {
    backend.save.mockRejectedValueOnce(new Error("Empresa alterada por outro usuário"));
    const close = vi.fn();
    render(<CompanyDialog open onOpenChange={close} company={company} edition={edition} />);
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Empresa alterada por outro usuário"),
    );
    expect(close).not.toHaveBeenCalled();
    const key = backend.save.mock.calls[0][0].idempotencyKey;
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(backend.save).toHaveBeenCalledTimes(2));
    expect(backend.save.mock.calls[1][0].idempotencyKey).toBe(key);
  });
});
