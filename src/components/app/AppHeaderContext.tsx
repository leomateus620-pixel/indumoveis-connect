/* eslint-disable react-refresh/only-export-components -- Contexto e composição pública do mesmo slot. */
import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { DestinationPath } from "@/lib/navigation";

export type AppHeaderCommands = {
  /** Rota proprietária: impede exibir comandos antigos durante uma navegação. */
  route: DestinationPath;
  commands: ReactNode;
};

type Entry = AppHeaderCommands & { owner: symbol };
type HeaderStore = ReturnType<typeof createHeaderStore>;

function createHeaderStore() {
  let entry: Entry | null = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => entry,
    getServerSnapshot: () => null,
    register(owner: symbol, configuration: AppHeaderCommands) {
      entry = { owner, ...configuration };
      emit();
      return () => {
        // Uma saída atrasada não pode apagar o registro da página seguinte.
        if (entry?.owner !== owner) return;
        entry = null;
        emit();
      };
    },
  };
}

const HeaderContext = createContext<HeaderStore | null>(null);

export function AppHeaderProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createHeaderStore);
  return <HeaderContext.Provider value={store}>{children}</HeaderContext.Provider>;
}

function useHeaderStore() {
  const store = useContext(HeaderContext);
  if (!store) throw new Error("Os comandos do cabeçalho precisam de AppHeaderProvider.");
  return store;
}

/**
 * Registra os comandos da página e os remove ao sair dela. O store só atualiza o
 * slot consumidor; registrar JSX não provoca uma nova renderização da página.
 */
export function useAppHeaderCommands({ route, commands }: AppHeaderCommands) {
  const store = useHeaderStore();
  const [owner] = useState(() => Symbol("app-header-page"));
  useLayoutEffect(
    () => store.register(owner, { route, commands }),
    [store, owner, route, commands],
  );
}

/** Consumido apenas pelo cabeçalho, que não precisa remontar o conteúdo da rota. */
export function useAppHeaderSlot(route: DestinationPath) {
  const store = useHeaderStore();
  const entry = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  return entry?.route === route ? entry : null;
}
