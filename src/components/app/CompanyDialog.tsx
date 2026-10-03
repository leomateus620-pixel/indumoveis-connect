/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDbMutation, api, useMe } from "@/lib/api";
import { FormRow } from "./ui";

const schema = z.object({
  legal_name: z.string().trim().min(2, "Informe a razão social").max(200),
  trade_name: z.string().trim().min(1, "Informe o nome fantasia").max(120),
  tax_id: z
    .string()
    .trim()
    .max(20)
    .refine(
      (v) => !v || [11, 14].includes(v.replace(/\D/g, "").length),
      "CNPJ/CPF deve ter 14 ou 11 dígitos",
    ),
  email: z
    .string()
    .trim()
    .max(255)
    .refine((v) => !v || z.string().email().safeParse(v).success, "E-mail inválido"),
  phone: z.string().trim().max(40),
  website: z.string().trim().max(200),
  city: z.string().trim().max(100),
  state: z.string().trim().max(2),
  segment: z.string().trim().max(100),
  notes: z.string().max(2000),
});

const EMPTY = {
  legal_name: "",
  trade_name: "",
  tax_id: "",
  email: "",
  phone: "",
  website: "",
  city: "",
  state: "",
  segment: "",
  notes: "",
};

export function CompanyDialog({
  open,
  onOpenChange,
  company,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  company?: any;
  onSaved?: (id: string) => void;
}) {
  const { data: me } = useMe();
  const [f, setF] = useState<any>(EMPTY);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setF(
        company ? Object.fromEntries(Object.keys(EMPTY).map((k) => [k, company[k] ?? ""])) : EMPTY,
      );
      setErr(null);
    }
  }, [open, company]);
  const m = useDbMutation(
    async () => {
      const r = schema.safeParse(f);
      if (!r.success) throw new Error(r.error.issues[0].message);
      const row: any = Object.fromEntries(
        Object.entries(r.data).map(([k, v]) => [k, v === "" ? null : v]),
      );
      row.legal_name = r.data.legal_name;
      row.trade_name = r.data.trade_name;
      try {
        return company?.id
          ? await api.update("companies", company.id, row)
          : await api.insert("companies", { ...row, created_by: me?.id });
      } catch (e: any) {
        if (e?.code === "23505") throw new Error("Já existe uma empresa com este CNPJ/CPF");
        throw e;
      }
    },
    {
      success: "Empresa salva",
      onSuccess: (r: any) => {
        onOpenChange(false);
        onSaved?.(r.id);
      },
    },
  );
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{company ? "Editar empresa" : "Nova empresa"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setErr(null);
            m.mutate(undefined, { onError: (x: any) => setErr(x.message) });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <FormRow label="Nome fantasia *" htmlFor="ct">
              <Input id="ct" value={f.trade_name} onChange={set("trade_name")} required />
            </FormRow>
            <FormRow label="Razão social *" htmlFor="cl">
              <Input id="cl" value={f.legal_name} onChange={set("legal_name")} required />
            </FormRow>
            <FormRow label="CNPJ / CPF" htmlFor="cx">
              <Input id="cx" value={f.tax_id} onChange={set("tax_id")} inputMode="numeric" />
            </FormRow>
            <FormRow label="Segmento" htmlFor="cs">
              <Input id="cs" value={f.segment} onChange={set("segment")} />
            </FormRow>
            <FormRow label="E-mail" htmlFor="ce">
              <Input id="ce" type="email" value={f.email} onChange={set("email")} />
            </FormRow>
            <FormRow label="Telefone" htmlFor="cp">
              <Input id="cp" value={f.phone} onChange={set("phone")} />
            </FormRow>
            <FormRow label="Cidade" htmlFor="cc">
              <Input id="cc" value={f.city} onChange={set("city")} />
            </FormRow>
            <FormRow label="UF" htmlFor="cu">
              <Input
                id="cu"
                maxLength={2}
                value={f.state}
                onChange={(e) => setF({ ...f, state: e.target.value.toUpperCase() })}
              />
            </FormRow>
          </div>
          <FormRow label="Site" htmlFor="cw">
            <Input id="cw" value={f.website} onChange={set("website")} />
          </FormRow>
          <FormRow label="Observações" htmlFor="cn">
            <Textarea id="cn" value={f.notes} onChange={set("notes")} />
          </FormRow>
          {err && (
            <p role="alert" className="text-sm text-destructive">
              {err}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={m.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
