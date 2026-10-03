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
- Files are stored once in the private `documents` bucket; modules link them via `document_links` (polymorphic entity_type/entity_id) — the central and modules show the same file.
- Agenda merges activities with dates already stored in inspections/installments instead of copying them.
- Every edition-scoped table carries `edition_id`; the active edition comes from `editions.is_active`, never hardcoded dates.
- `ensure_profile()` creates only the caller's profile; the first admin is assigned explicitly through a controlled administrative action, never from sign-in — prevents privilege escalation when no admin exists.
- The last admin role is protected by a transaction-level database guard — simultaneous demotions cannot leave the system without administration.
- No Edge Functions yet: no external integrations exist; add server routes/server functions only when a secret-bearing integration is required.
