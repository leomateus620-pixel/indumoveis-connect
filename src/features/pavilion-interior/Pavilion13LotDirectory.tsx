import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { InteriorEnvironment } from "./data";
import { PAVILION_13_SECTORS, pavilion13Sector, type Pavilion13Sector } from "./pavilion13-sectors";
import "./pavilion13-directory.css";

type Props = {
  environments: readonly InteriorEnvironment[];
  selectedCode?: string;
  onSelect: (code: string) => void;
};

export function Pavilion13LotDirectory({ environments, selectedCode, onSelect }: Props) {
  const id = useId();
  const [openSector, setOpenSector] = useState<Pavilion13Sector>();
  const selectedSector = selectedCode ? pavilion13Sector(selectedCode) : undefined;

  return (
    <nav className="arq-p13-directory" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="arq-eyebrow">
        Lotes por setor
      </h3>
      {PAVILION_13_SECTORS.map(({ key, label }) => {
        const lots = environments
          .filter((lot) => lot.kind === "commercial" && pavilion13Sector(lot.code) === key)
          .sort((a, b) => a.code.localeCompare(b.code));
        if (!lots.length) return null;

        const expanded = openSector === key;
        const triggerId = `${id}-${key}`;
        const panelId = `${triggerId}-lots`;
        const range = lots.length === 1 ? lots[0].code : `${lots[0].code}–${lots.at(-1)!.code}`;

        return (
          <div className="arq-p13-directory-sector" data-p13-sector={key} key={key}>
            <button
              type="button"
              id={triggerId}
              className="arq-p13-directory-toggle"
              aria-expanded={expanded}
              aria-controls={panelId}
              data-selected={selectedSector === key}
              onClick={() => setOpenSector(expanded ? undefined : key)}
            >
              <span className="arq-p13-directory-swatch" aria-hidden="true" />
              <span>{label}</span>
              <span className="arq-p13-directory-range">{range}</span>
              <ChevronDown size={14} aria-hidden="true" />
            </button>
            <div id={panelId} role="group" aria-labelledby={triggerId} hidden={!expanded}>
              {expanded && (
                <div className="arq-p13-directory-grid">
                  {lots.map((lot) => (
                    <button
                      type="button"
                      key={lot.id}
                      aria-label={lot.name}
                      aria-pressed={lot.code === selectedCode}
                      onClick={() => onSelect(lot.code)}
                    >
                      {lot.code}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
