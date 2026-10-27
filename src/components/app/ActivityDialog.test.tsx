import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityDialog } from "./ActivityDialog";

const api = vi.hoisted(() => ({
  edition: undefined as { id: string; timezone: string } | undefined,
  me: undefined as { id: string } | undefined,
  save: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  useEdition: () => ({ data: api.edition }),
  useMe: () => ({ data: api.me }),
  useActivityCategories: () => ({ data: [] }),
  useCommissions: () => ({ data: [] }),
  useAgendaPeople: () => ({ data: [{ id: "person-1", full_name: "Maria Silva" }] }),
  saveActivity: api.save,
  useDbMutation: (save: () => Promise<unknown>, options: { onSuccess: () => void }) => ({
    isPending: false,
    mutate: async () => {
      try {
        await save();
        options.onSuccess();
      } catch {
        // The real mutation reports errors through the shared toast and leaves the form open.
      }
    },
  }),
}));

const initialActivity = {
  id: "activity-1",
  version: 3,
  title: "Reunião de montagem",
  description: "Alinhar a montagem dos espaços.",
  kind: "reuniao",
  start_at: "2027-05-14T18:00:00Z",
  end_at: "2027-05-14T19:00:00Z",
  assignee_id: "person-1",
};

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  api.edition = { id: "edition-1", timezone: "America/Sao_Paulo" };
  api.me = { id: "person-1" };
  api.save.mockReset().mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ActivityDialog editing session", () => {
  it("keeps the draft, discard guard and original version through a background refetch", async () => {
    const onOpenChange = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const remote = { ...initialActivity, version: 4, title: "Título alterado pela equipe" };
    const { rerender } = render(
      <ActivityDialog open onOpenChange={onOpenChange} activity={initialActivity} />,
    );
    fireEvent.change(screen.getByLabelText("Título *"), {
      target: { value: "Meu rascunho em andamento" },
    });
    rerender(<ActivityDialog open onOpenChange={onOpenChange} activity={remote} />);
    expect(screen.getByLabelText("Título *")).toHaveValue("Meu rascunho em andamento");

    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(confirm).toHaveBeenCalledWith("Descartar as alterações não salvas?");
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(api.save).toHaveBeenCalledOnce());
    expect(api.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        p_activity_id: "activity-1",
        p_title: "Meu rascunho em andamento",
        p_expected_version: 3,
        p_idempotency_key: null,
      }),
    );

    rerender(<ActivityDialog open={false} onOpenChange={onOpenChange} activity={remote} />);
    rerender(<ActivityDialog open onOpenChange={onOpenChange} activity={remote} />);
    expect(screen.getByLabelText("Título *")).toHaveValue(remote.title);
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(2));
    expect(api.save).toHaveBeenLastCalledWith(expect.objectContaining({ p_expected_version: 4 }));
  });

  it("fills late creation context only into untouched fields and preserves its retry key", async () => {
    api.edition = undefined;
    api.me = undefined;
    const onOpenChange = vi.fn();
    const { rerender } = render(<ActivityDialog open onOpenChange={onOpenChange} />);
    fireEvent.change(screen.getByLabelText("Título *"), {
      target: { value: "Título já digitado" },
    });
    fireEvent.change(screen.getByLabelText("Início"), {
      target: { value: "2027-05-14T16:30" },
    });

    api.edition = { id: "edition-1", timezone: "America/Sao_Paulo" };
    api.me = { id: "person-1" };
    const lateProps = {
      defaults: { title: "Título sugerido", description: "Descrição da origem" },
      related: { type: "company", id: "company-1" },
    };
    rerender(<ActivityDialog open onOpenChange={onOpenChange} {...lateProps} />);
    expect(screen.getByLabelText("Título *")).toHaveValue("Título já digitado");
    expect(screen.getByLabelText("Início")).toHaveValue("2027-05-14T16:30");
    expect(screen.getByLabelText("Descrição")).toHaveValue("Descrição da origem");
    expect(screen.getByLabelText("Responsável principal")).toHaveValue("person-1");
    expect(screen.getByLabelText("Identificador")).toHaveValue("company-1");

    api.save.mockRejectedValueOnce(new Error("Falha temporária"));
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(api.save).toHaveBeenCalledOnce());
    expect(onOpenChange).not.toHaveBeenCalled();
    const retryKey = api.save.mock.calls[0][0].p_idempotency_key;
    expect(retryKey).toEqual(expect.any(String));
    rerender(<ActivityDialog open onOpenChange={onOpenChange} {...lateProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(2));
    expect(api.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        p_activity_id: null,
        p_expected_version: 0,
        p_idempotency_key: retryKey,
        p_title: "Título já digitado",
        p_related_type: "company",
        p_related_id: "company-1",
      }),
    );

    rerender(<ActivityDialog open={false} onOpenChange={onOpenChange} {...lateProps} />);
    rerender(<ActivityDialog open onOpenChange={onOpenChange} {...lateProps} />);
    expect(screen.getByLabelText("Título *")).toHaveValue("Título sugerido");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(3));
    expect(api.save.mock.calls[2][0].p_idempotency_key).not.toBe(retryKey);
  });

  it("localizes an untouched schedule when edition timezone arrives without erasing edited fields", () => {
    api.edition = undefined;
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <ActivityDialog open onOpenChange={onOpenChange} activity={initialActivity} />,
    );
    fireEvent.change(screen.getByLabelText("Título *"), {
      target: { value: "Rascunho preservado" },
    });
    fireEvent.change(screen.getByLabelText("Fim"), {
      target: { value: "2027-05-14T17:30" },
    });
    api.edition = { id: "edition-1", timezone: "America/Los_Angeles" };
    rerender(<ActivityDialog open onOpenChange={onOpenChange} activity={{ ...initialActivity }} />);
    expect(screen.getByLabelText("Título *")).toHaveValue("Rascunho preservado");
    expect(screen.getByLabelText("Início")).toHaveValue("2027-05-14T11:00");
    expect(screen.getByLabelText("Fim")).toHaveValue("2027-05-14T17:30");
  });
});
