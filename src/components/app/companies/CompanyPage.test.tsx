/* eslint-disable @typescript-eslint/no-explicit-any -- Minimal router and data fixtures for route integration tests. */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "@/routes/_authenticated/_app/empresas.$id";

const state = vi.hoisted(() => ({
  search: { edition: "2025", q: "Móveis", expanded: "company" },
  canWrite: true,
  navigate: vi.fn(),
  deals: vi.fn(),
  contracts: vi.fn(),
  activities: vi.fn(),
  participation: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: any) => ({
    ...options,
    fullPath: "/empresas/$id",
    useParams: () => ({ id: "company" }),
    useSearch: () => state.search,
  }),
  useNavigate: () => state.navigate,
  Link: ({ children, to, search, ...props }: any) => (
    <a
      href={`${to}?edition=${search?.edition ?? ""}&q=${search?.q ?? ""}&expanded=${search?.expanded ?? ""}`}
      {...props}
    >
      {children}
    </a>
  ),
}));
vi.mock("@/lib/api", () => ({
  useCompanyEditions: () => ({
    data: [
      { id: "2025", year: 2025, is_historical: true, is_active: false },
      { id: "2027", year: 2027, is_historical: false, is_active: true },
    ],
  }),
  useCompanyParticipation: state.participation,
  useCompanyDeals: state.deals,
  useCompanyContracts: state.contracts,
  useCompanyActivities: state.activities,
  useCan: () => ({ read: true, write: state.canWrite }),
  useDbMutation: () => ({ isPending: false, mutate: vi.fn() }),
  api: {},
  signedUrl: vi.fn(),
}));
vi.mock("@/components/app/shared", () => ({
  RelatedLink: ({ children }: any) => <span>{children}</span>,
  ActivityDialog: () => null,
}));
vi.mock("@/components/app/CompanyDialog", () => ({ CompanyDialog: () => null }));
vi.mock("@/components/app/documents/AttachedDocuments", () => ({
  AttachedDocuments: ({ editionId, canWrite }: any) => (
    <div data-testid="documents">
      {editionId} · escrita {String(canWrite)}
    </div>
  ),
}));
const detail = {
  company: {
    id: "company",
    trade_name: "Nome atual 2027",
    legal_name: "Cadastro atual",
    email: "current@example.com",
    phone: "11999999999",
  },
  participation: {
    id: "participation",
    snapshot_locked: true,
    registration_snapshot: {
      trade_name: "Móveis em 2025",
      legal_name: "Cadastro de 2025",
      email: null,
      phone: null,
    },
  },
  contacts: [],
  occupations: [
    { id: "o", area_label: "Área Externa", module_codes: ["001", "002"], area_total: 36.25 },
  ],
};
beforeEach(() => {
  state.search = { edition: "2025", q: "Móveis", expanded: "company" };
  state.canWrite = true;
  state.participation.mockImplementation((_id, edition) => ({
    data: edition === "2025" ? detail : undefined,
    isLoading: false,
    isError: false,
  }));
  for (const hook of [state.deals, state.contracts, state.activities])
    hook.mockReturnValue({ data: [], isLoading: false, isError: false });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const CompanyPage = (Route as any).component;

describe("company sheet edition navigation", () => {
  it("shows the immutable selected identity and scopes related tabs and documents to that edition", () => {
    render(<CompanyPage />);
    expect(screen.getByRole("heading", { name: "Móveis em 2025" })).toBeVisible();
    expect(screen.queryByText("Nome atual 2027")).not.toBeInTheDocument();
    expect(screen.queryByText("current@example.com")).not.toBeInTheDocument();
    expect(state.deals).toHaveBeenLastCalledWith("company", "2025", false);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Negociações e espaços" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(state.deals).toHaveBeenLastCalledWith("company", "2025", true);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Documentos" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getByTestId("documents")).toHaveTextContent("2025 · escrita false");
    expect(screen.queryByRole("link", { name: "Nova negociação" })).not.toBeInTheDocument();
  });
  it("preserves the list filters and expanded card in the return URL and changes only local edition context", () => {
    render(<CompanyPage />);
    expect(screen.getByRole("link", { name: "Empresas" })).toHaveAttribute(
      "href",
      "/empresas?edition=2025&q=Móveis&expanded=company",
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "2027" } });
    expect(state.navigate).toHaveBeenLastCalledWith({
      search: { edition: "2027", q: "Móveis", expanded: "company" },
      replace: true,
    });
  });
  it("keeps mutation actions hidden from read-only profiles", () => {
    state.canWrite = false;
    render(<CompanyPage />);
    expect(screen.queryByRole("button", { name: "Editar dados atuais" })).not.toBeInTheDocument();
  });
});
