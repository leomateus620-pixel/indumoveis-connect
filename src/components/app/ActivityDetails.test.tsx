import { useRef, useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityDetails, type ActivityDetailsActivity } from "./ActivityDetails";

const state = vi.hoisted(() => ({
  permissions: {
    documentos: { read: true, write: true },
    empresas: { read: true, write: false },
  },
  setStatus: vi.fn().mockResolvedValue(4),
}));

vi.mock("@/lib/api", () => ({
  useMe: () => ({ data: { perms: state.permissions } }),
  setActivityStatus: state.setStatus,
  useDbMutation: (fn: (value: string) => Promise<unknown>) => ({
    mutate: (value: string) => void fn(value),
    isPending: false,
    variables: undefined,
  }),
}));
vi.mock("@/components/app/shared", () => ({
  RELATED_LABEL: { company: "Empresa" },
  RelatedLink: ({ children, id }: { children: React.ReactNode; id: string }) => (
    <a href={`/empresas/${id}`}>{children}</a>
  ),
}));
vi.mock("@/components/app/documents/AttachedDocuments", () => ({
  AttachedDocuments: ({ canWrite, entityId }: { canWrite: boolean; entityId: string }) => (
    <div data-testid="documents" data-activity={entityId} data-can-write={canWrite}>
      Documentos existentes
    </div>
  ),
}));

const activity: ActivityDetailsActivity = {
  id: "activity-1",
  title: "Alinhamento dos expositores",
  kind: "reuniao",
  status: "aberta",
  version: 3,
  description: "Descrição completa e única.\nPróximos encaminhamentos.",
  start_at: "2026-10-27T14:00:00-03:00",
  end_at: "2026-10-27T16:30:00-03:00",
  all_day: false,
  location: "Sala da organização",
  related_type: "company",
  related_id: "company-1",
  activity_categories: { name: "Comercial" },
  activity_assignees: [
    { profile_id: "person-2", is_primary: false, profiles: { full_name: "Ana Silva" } },
    { profile_id: "person-1", is_primary: true, profiles: { full_name: "Leonardo Mateus" } },
  ],
  activity_commissions: [{ commission_id: "commission-1", commissions: { name: "Expositores" } }],
};

const props = {
  activity,
  open: true,
  onOpenChange: vi.fn(),
  canWrite: true,
  timeZone: "America/Sao_Paulo",
  onEdit: vi.fn(),
};

beforeEach(() => {
  state.permissions.documentos = { read: true, write: true };
  state.permissions.empresas = { read: true, write: false };
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("ActivityDetails", () => {
  it("presents real scheduling, primary and additional assignees and one complete description", () => {
    render(<ActivityDetails {...props} />);
    const dialog = screen.getByRole("dialog", { name: activity.title });
    expect(within(dialog).getByText("Comercial")).toBeInTheDocument();
    expect(within(dialog).getByText("Reunião")).toBeInTheDocument();
    const schedule = within(dialog).getByRole("region", { name: "Programação" });
    expect(schedule).toHaveTextContent("14:00");
    expect(schedule).toHaveTextContent("16:30");
    expect(schedule).toHaveTextContent("Duração de 2h 30min");
    const responsibility = within(dialog).getByRole("region", { name: "Responsabilidade" });
    expect(within(responsibility).getByText("Leonardo Mateus").parentElement).toHaveTextContent(
      "Principal",
    );
    expect(within(responsibility).getByText("Ana Silva").parentElement).not.toHaveTextContent(
      "Principal",
    );
    expect(within(dialog).getAllByText(/Descrição completa e única/)).toHaveLength(1);
    expect(within(dialog).getByRole("link", { name: "Abrir empresa" })).toHaveAttribute(
      "href",
      "/empresas/company-1",
    );
    expect(within(dialog).getByTestId("documents")).toHaveAttribute("data-activity", activity.id);
    expect(within(dialog).getByTestId("documents")).toHaveAttribute("data-can-write", "true");
  });

  it("keeps multi-day dates in the edition timezone and uses civil days for all-day duration", () => {
    render(
      <ActivityDetails
        {...props}
        activity={{
          ...activity,
          all_day: true,
          start_at: "2026-10-27T00:00:00-03:00",
          end_at: "2026-10-29T00:00:00-03:00",
        }}
      />,
    );
    const schedule = screen.getByRole("region", { name: "Programação" });
    expect(schedule).toHaveTextContent("27 de outubro de 2026");
    expect(schedule).toHaveTextContent("29 de outubro de 2026");
    expect(within(schedule).getAllByText("Dia inteiro")).toHaveLength(2);
    expect(schedule).toHaveTextContent("Duração de 3 dias");
    expect(schedule).not.toHaveTextContent("00:00");
  });

  it("presents undated activities without manufacturing scheduling or duration", () => {
    render(<ActivityDetails {...props} activity={{ ...activity, start_at: null, end_at: null }} />);
    const schedule = screen.getByRole("region", { name: "Programação" });
    expect(schedule).toHaveTextContent("Data a definir");
    expect(schedule).not.toHaveTextContent("Duração");
  });

  it("gates mutation actions, origin navigation and document access individually", () => {
    state.permissions.empresas.read = false;
    state.permissions.documentos = { read: false, write: false };
    render(<ActivityDetails {...props} canWrite={false} />);
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Concluir" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Abrir empresa" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("documents")).not.toBeInTheDocument();
    expect(screen.getByText(/Acesso aos documentos não disponível/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("preserves document reading while removing upload actions without document write permission", () => {
    state.permissions.documentos.write = false;
    render(<ActivityDetails {...props} />);
    expect(screen.getByTestId("documents")).toHaveAttribute("data-can-write", "false");
  });

  it("uses the atomic status mutation with the selected activity version and requests editing directly", async () => {
    render(<ActivityDetails {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    await waitFor(() =>
      expect(state.setStatus).toHaveBeenCalledWith(activity.id, "concluida", activity.version),
    );
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(props.onEdit).toHaveBeenCalledOnce();
  });

  it("offers reopening rather than completion for a cancelled activity", async () => {
    render(<ActivityDetails {...props} activity={{ ...activity, status: "cancelada" }} />);
    expect(screen.queryByRole("button", { name: "Concluir" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reabrir" }));
    await waitFor(() =>
      expect(state.setStatus).toHaveBeenCalledWith(activity.id, "aberta", activity.version),
    );
  });

  it("closes with Escape and allows the page to restore focus without scrolling", async () => {
    function Workspace() {
      const [open, setOpen] = useState(false);
      const trigger = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button ref={trigger} onClick={() => setOpen(true)}>
            Abrir atividade
          </button>
          <ActivityDetails
            {...props}
            open={open}
            onOpenChange={setOpen}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              trigger.current?.focus({ preventScroll: true });
            }}
          />
        </>
      );
    }
    render(<Workspace />);
    const trigger = screen.getByRole("button", { name: "Abrir atividade" });
    fireEvent.click(trigger);
    await screen.findByRole("dialog", { name: activity.title });
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
