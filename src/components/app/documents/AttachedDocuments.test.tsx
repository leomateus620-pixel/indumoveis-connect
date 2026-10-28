import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttachedDocuments } from "./AttachedDocuments";

const backend = vi.hoisted(() => ({
  search: vi.fn(),
  upload: vi.fn(),
  link: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  useEntityDocuments: () => ({ data: [], isLoading: false, isError: false }),
  useDocumentSearch: backend.search,
  useEdition: () => ({ data: { id: "active-edition", name: "Edição ativa" } }),
  uploadDocument: backend.upload,
  linkDocument: backend.link,
  signedUrl: vi.fn(),
  useDbMutation: (save: (id: string) => Promise<unknown>, options: { onSuccess: () => void }) => ({
    isPending: false,
    mutate: async (id: string) => {
      await save(id);
      options.onSuccess();
    },
  }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: backend.invalidate }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("./common", () => ({ DocIcon: () => null, LinkChips: () => null, LinkPicker: () => null }));
vi.mock("./DocumentPanel", () => ({ DocumentPanel: () => null }));
const rows = [
  {
    id: "doc-2025",
    root_id: "doc-2025",
    edition_id: "edition-2025",
    display_name: "Documento anterior",
    name: "anterior.pdf",
    category: "cadastro",
    version: 1,
  },
  {
    id: "doc-2027",
    root_id: "doc-2027",
    edition_id: "edition-2027",
    display_name: "Documento selecionado",
    name: "atual.pdf",
    category: "cadastro",
    version: 1,
  },
];
beforeEach(() => {
  backend.search.mockReturnValue({ data: { rows }, isLoading: false, isError: false });
  backend.upload.mockResolvedValue({ id: "uploaded" });
  backend.link.mockResolvedValue({});
  backend.invalidate.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("company document edition context", () => {
  it("searches and links only the sheet edition, including while previous results remain cached", async () => {
    render(
      <AttachedDocuments
        entityType="company"
        entityId="company"
        category="cadastro"
        canWrite
        editionId="edition-2027"
        editionName="Indumóveis 2027"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Associar documento existente" }));
    expect(backend.search).toHaveBeenLastCalledWith(
      { scope: "edition", editionId: "edition-2027", q: "", limit: 15 },
      true,
    );
    expect(screen.queryByText("Documento anterior")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Documento selecionado/ }));
    await waitFor(() =>
      expect(backend.link).toHaveBeenCalledWith("doc-2027", "company", "company"),
    );
  });

  it("uploads to the sheet edition explicitly and cannot silently switch to general or active edition", async () => {
    render(
      <AttachedDocuments
        entityType="company"
        entityId="company"
        category="cadastro"
        canWrite
        editionId="edition-2027"
        editionName="Indumóveis 2027"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Anexar arquivo" }));
    expect(screen.getByLabelText("Edição")).toBeDisabled();
    expect(screen.getByRole("option", { name: "Indumóveis 2027" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Geral \(/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Arquivo"), {
      target: { files: [new File(["cadastro"], "cadastro.txt", { type: "text/plain" })] },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Enviar" }).closest("form")!);
    await waitFor(() =>
      expect(backend.upload).toHaveBeenCalledWith(
        expect.objectContaining({
          editionId: "edition-2027",
          links: [{ type: "company", id: "company" }],
        }),
      ),
    );
  });

  it("preserves all-edition association and active/general upload choices for callers without a scoped edition", () => {
    const { unmount } = render(
      <AttachedDocuments entityType="company" entityId="company" category="cadastro" canWrite />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Associar documento existente" }));
    expect(backend.search).toHaveBeenLastCalledWith(
      { scope: "all", editionId: undefined, q: "", limit: 15 },
      true,
    );
    expect(screen.getByText("Documento anterior")).toBeVisible();
    expect(screen.getByText("Documento selecionado")).toBeVisible();
    unmount();
    render(
      <AttachedDocuments entityType="company" entityId="company" category="cadastro" canWrite />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Anexar arquivo" }));
    expect(screen.getByLabelText("Edição")).not.toBeDisabled();
    expect(
      screen.getByRole("option", { name: "Geral (não pertence a uma edição)" }),
    ).toBeInTheDocument();
  });

  it("exposes no attach or upload action in a read-only historical sheet", () => {
    render(
      <AttachedDocuments
        entityType="company"
        entityId="company"
        category="cadastro"
        canWrite={false}
        editionId="edition-2025"
      />,
    );
    expect(screen.queryByRole("button", { name: "Anexar arquivo" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Associar documento existente" }),
    ).not.toBeInTheDocument();
  });
});
