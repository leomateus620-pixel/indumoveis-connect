<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

## Sistema Indumóveis — decisões de arquitetura

- All data access goes through `src/lib/api.ts` (React Query hooks + `useDbMutation`); pages never query the backend directly — keeps one source of truth and uniform invalidation.
- Authorization lives in the database: RLS uses `can_read/can_write(module)` driven by `user_roles` + `role_permissions`; UI checks via `useCan` are only cosmetic.
- Multi-step operations (deal+spaces, transitions, contract creation/versions/status, installments, payments, inspections) are SECURITY DEFINER SQL functions that re-check permissions — guarantees atomicity and server-side conflict checks.
- Space commercial status is derived (`space_status_v`) from deals, never stored — map, dashboard and lists can't diverge.
- Deal/contract/installment reconciliation (signature→contracted, cancellation cascade, unpaid-installment cancellation, edit locks, version checks) lives only in the SQL transition functions; the client mirrors rules in `src/lib/journey.ts` for display only — one write path, no divergent states.
- Contracts store a `deal_snapshot` taken at preparation/refresh; divergence is computed by comparing it with the live deal — emitted/signed text is never rewritten.
- Files are stored once in the private `documents` bucket; links live on the chain's root document (`document_links`, polymorphic incl. `activity`) so every version shares them — the central and modules show the same file.
- Document access requires reading Documentos AND every linked source module (`can_read_document`), applied equally to rows, links and Storage objects — a less restricted link can never expose a sensitive file.
- Document uploads are two-phase (`begin_document_upload`/`begin_document_version` → Storage → `finalize_document_upload`, with own-pending compensation) and the next version number is computed and locked server-side — no orphans, no client-side versioning.
- Agenda merges activities with dates already stored in inspections/installments instead of copying them.
- Agenda uses `activities.start_at` as its canonical timestamp in the edition timezone; `due_at` is a synchronized compatibility field, while inspection and installment dates remain civil dates in their source tables.
- Activity content, assignees, commissions, status, version history, and catalog maintenance are persisted through atomic database functions with permission and concurrency checks.
- Every edition-scoped table carries `edition_id`; the active edition comes from `editions.is_active`, never hardcoded dates.
- `ensure_profile()` creates only the caller's profile; `provision_initial_admin(uuid)` accepts only the service role and an explicitly selected existing account when no admin exists — prevents automatic privilege escalation from sign-in.
- The last admin role is protected by a transaction-level database guard — simultaneous demotions cannot leave the system without administration.
- No Edge Functions yet: no external integrations exist; add server routes/server functions only when a secret-bearing integration is required.
- Internal menus share presentation primitives in `src/components/app/ui.tsx` and semantic surface tokens in `src/styles.css` — keeps desktop tables, mobile lists, and accessible controls consistent without changing data flows.
