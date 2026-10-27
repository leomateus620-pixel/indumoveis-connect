import { useRef, useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ActivityDetails, type ActivityDetailsActivity } from "./ActivityDetails";
import { ActivityDialog } from "./ActivityDialog";

const edition = { id: "edition-1", timezone: "America/Sao_Paulo" };
const me = { id: "person-1", perms: { documentos: { read: false, write: false } } };

vi.mock("@/lib/api", () => ({
  useMe: () => ({ data: me }),
  useEdition: () => ({ data: edition }),
  useActivityCategories: () => ({ data: [] }),
  useCommissions: () => ({ data: [] }),
  useAgendaPeople: () => ({ data: [] }),
  setActivityStatus: vi.fn(),
  saveActivity: vi.fn(),
  useDbMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/components/app/shared", () => ({ RELATED_LABEL: {}, RelatedLink: () => null }));
vi.mock("@/components/app/documents/AttachedDocuments", () => ({ AttachedDocuments: () => null }));

const activity: ActivityDetailsActivity = {
  id: "activity-1",
  title: "Contexto da atividade",
  kind: "reuniao",
  status: "aberta",
  version: 2,
};

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(cleanup);
afterAll(() => vi.unstubAllGlobals());

function Workspace() {
  const [selected, setSelected] = useState(false);
  const [editing, setEditing] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={trigger} onClick={() => setSelected(true)}>
        Abrir evento
      </button>
      <output aria-label="Contexto selecionado">{selected ? activity.id : "nenhum"}</output>
      <ActivityDialog
        open={editing}
        onOpenChange={setEditing}
        activity={selected ? activity : undefined}
      />
      <ActivityDetails
        activity={selected ? activity : undefined}
        open={selected && !editing}
        onOpenChange={(next) => !next && !editing && setSelected(false)}
        onEdit={() => setEditing(true)}
        canWrite
        timeZone={edition.timezone}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (!editing) trigger.current?.focus({ preventScroll: true });
        }}
      />
    </>
  );
}

describe("Activity details/edit context", () => {
  it("opens one edit dialog and returns to the selected details with focus inside", async () => {
    render(<Workspace />);
    const trigger = screen.getByRole("button", { name: "Abrir evento" });
    trigger.focus();
    fireEvent.click(trigger);
    await screen.findByRole("dialog", { name: activity.title });
    const edit = screen.getByRole("button", { name: "Editar" });
    edit.focus();
    fireEvent.click(edit);
    const editor = await screen.findByRole("dialog", { name: "Editar atividade" });
    await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(1));
    expect(editor).toContainElement(document.activeElement as HTMLElement);
    expect(screen.getByLabelText("Contexto selecionado")).toHaveTextContent(activity.id);
    expect(screen.getByLabelText("Título *")).toHaveValue(activity.title);
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    const details = await screen.findByRole("dialog", { name: activity.title });
    await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(1));
    await waitFor(() => expect(details).toContainElement(document.activeElement as HTMLElement));
    expect(screen.getByLabelText("Contexto selecionado")).toHaveTextContent(activity.id);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
