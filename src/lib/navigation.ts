// Registro único dos acessos do sistema: usado pelo portal, pela navegação lateral,
// pela verificação de rota do AppShell e pelo retorno pós-login.
// A autorização efetiva continua no banco (RLS); aqui cada destino só declara a
// chave de módulo que o perfil precisa ler para vê-lo.
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardCheck,
  Coins,
  FileText,
  Folder,
  Handshake,
  LayoutGrid,
  MapPin,
  MapPinned,
  Settings,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react";

export type ModuleKey =
  | "dashboard"
  | "mapa"
  | "comercial"
  | "empresas"
  | "contratos"
  | "vistorias"
  | "financeiro"
  | "agenda"
  | "documentos"
  | "admin";

export type DestinationPath =
  | "/dashboard"
  | "/mapa"
  | "/comercializacao"
  | "/empresas"
  | "/contratos"
  | "/vistorias"
  | "/financeiro"
  | "/agenda"
  | "/documentos"
  | "/admin";

export type NavDestination = {
  to: DestinationPath;
  /** Nome curto dentro do grupo (sidebar e lista expandida do portal). */
  label: string;
  /** Nome completo do módulo, usado no cabeçalho móvel. */
  title: string;
  openLabel: string;
  module: ModuleKey;
  icon: LucideIcon;
  /** Aquecimento sob demanda (intenção do usuário), nunca automático no portal. */
  prewarm?: () => void;
};

export type NavCategoryId =
  "agenda" | "mapa" | "empresas" | "financeiro" | "vistorias" | "administracao";

export type NavCategory = {
  id: NavCategoryId;
  title: string;
  description: string;
  icon: LucideIcon;
  destinations: readonly NavDestination[];
};

export type Perms = Record<string, { read: boolean; write?: boolean }> | undefined;

let mapRendererWarmed = false;
export function prewarmMapRenderer() {
  if (mapRendererWarmed) return;
  mapRendererWarmed = true;
  void import("@/features/commercial-map/MapRenderer").catch(() => {
    mapRendererWarmed = false;
  });
}

export const PORTAL_PATH = "/" as const;
export const PORTAL_ENTRY = {
  to: PORTAL_PATH,
  label: "Portal",
  title: "Portal Indumóveis",
  icon: LayoutGrid,
} as const;

export const NAV_CATEGORIES: readonly NavCategory[] = [
  {
    id: "agenda",
    title: "Agenda",
    description: "Compromissos e atividades da feira.",
    icon: CalendarDays,
    destinations: [
      {
        to: "/agenda",
        label: "Agenda / Atividades",
        title: "Agenda / Atividades",
        openLabel: "Abrir agenda",
        module: "agenda",
        icon: CalendarDays,
      },
    ],
  },
  {
    id: "mapa",
    title: "Mapa Comercial",
    description: "Espaços, disponibilidade e comercialização.",
    icon: MapPinned,
    destinations: [
      {
        to: "/mapa",
        label: "Mapa do parque",
        title: "Mapa Comercial",
        openLabel: "Abrir mapa",
        module: "mapa",
        icon: MapPin,
        prewarm: prewarmMapRenderer,
      },
      {
        to: "/comercializacao",
        label: "Comercialização",
        title: "Comercialização",
        openLabel: "Abrir comercialização",
        module: "comercial",
        icon: Handshake,
      },
    ],
  },
  {
    id: "empresas",
    title: "Empresas / Expositores",
    description: "Cadastro e gestão dos participantes.",
    icon: UsersRound,
    destinations: [
      {
        to: "/empresas",
        label: "Empresas / Expositores",
        title: "Empresas / Expositores",
        openLabel: "Abrir empresas",
        module: "empresas",
        icon: Users,
      },
    ],
  },
  {
    id: "financeiro",
    title: "Financeiro",
    description: "Recebimentos e operação financeira.",
    icon: Wallet,
    destinations: [
      {
        to: "/financeiro",
        label: "Financeiro Operacional",
        title: "Financeiro Operacional",
        openLabel: "Abrir financeiro",
        module: "financeiro",
        icon: Coins,
      },
    ],
  },
  {
    id: "vistorias",
    title: "Vistorias",
    description: "Inspeções e acompanhamento dos espaços.",
    icon: ClipboardCheck,
    destinations: [
      {
        to: "/vistorias",
        label: "Vistorias",
        title: "Vistorias",
        openLabel: "Abrir vistorias",
        module: "vistorias",
        icon: ClipboardCheck,
      },
    ],
  },
  {
    id: "administracao",
    title: "Administração",
    description: "Dashboard, documentos, contratos e configurações.",
    icon: BriefcaseBusiness,
    destinations: [
      {
        to: "/dashboard",
        label: "Dashboard",
        title: "Dashboard",
        openLabel: "Abrir dashboard",
        module: "dashboard",
        icon: BarChart3,
      },
      {
        to: "/documentos",
        label: "Documentos",
        title: "Documentos",
        openLabel: "Abrir documentos",
        module: "documentos",
        icon: Folder,
      },
      {
        to: "/contratos",
        label: "Contratos",
        title: "Contratos",
        openLabel: "Abrir contratos",
        module: "contratos",
        icon: FileText,
      },
      {
        to: "/admin",
        label: "Configurações",
        title: "Administração",
        openLabel: "Abrir configurações",
        module: "admin",
        icon: Settings,
      },
    ],
  },
];

export const NAV_DESTINATIONS: readonly NavDestination[] = NAV_CATEGORIES.flatMap(
  (c) => c.destinations,
);

/** Destino dono de um caminho, incluindo rotas de detalhe (`/empresas/:id`). */
export function matchDestination(pathname: string): NavDestination | undefined {
  return NAV_DESTINATIONS.find((d) => pathname === d.to || pathname.startsWith(d.to + "/"));
}

export function canOpen(perms: Perms, destination: NavDestination) {
  return !!perms?.[destination.module]?.read;
}

export type VisibleCategory = { category: NavCategory; destinations: NavDestination[] };

/** Categorias com ao menos um destino legível; cada destino respeita a própria chave. */
export function visibleCategories(perms: Perms): VisibleCategory[] {
  return NAV_CATEGORIES.map((category) => ({
    category,
    destinations: category.destinations.filter((d) => canOpen(perms, d)),
  })).filter((c) => c.destinations.length > 0);
}
