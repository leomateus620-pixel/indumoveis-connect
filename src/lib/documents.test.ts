import { describe, expect, it } from "vitest";
import { canReadDocument, currentVersion, previewMode, validateDocFile } from "./documents";

describe("documentos", () => {
  it("aceita até 25 MB e recusa acima", () => {
    expect(validateDocFile({ name: "a.pdf", size: 25 * 1024 * 1024 })).toBeNull();
    expect(validateDocFile({ name: "a.pdf", size: 25 * 1024 * 1024 + 1 })).toMatch(/25 MB/);
  });
  it("bloqueia HTML, SVG e executáveis", () => {
    for (const n of ["x.html", "x.svg", "x.exe", "x"])
      expect(validateDocFile({ name: n, size: 10 })).toMatch(/Formato/);
    expect(validateDocFile({ name: "planta.DWG", size: 10 })).toBeNull();
  });
  it("só pré-visualiza PDF e imagens raster", () => {
    expect(previewMode("a.pdf")).toBe("pdf");
    expect(previewMode("a.png")).toBe("image");
    expect(previewMode("a.docx")).toBe("none");
  });
  it("versão vigente ignora pendentes", () => {
    const rows = [
      { version: 1, is_current: false, status: "ativo" },
      { version: 2, is_current: true, status: "ativo" },
      { version: 3, is_current: false, status: "pendente" },
    ];
    expect(currentVersion(rows)?.version).toBe(2);
  });
  it("exige leitura de todas as origens vinculadas", () => {
    const perms = { documentos: { read: true }, contratos: { read: true }, financeiro: { read: false } };
    expect(canReadDocument(perms, [])).toBe(true);
    expect(canReadDocument(perms, ["contract"])).toBe(true);
    expect(canReadDocument(perms, ["contract", "installment"])).toBe(false);
  });
});
