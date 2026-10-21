# Staff account cleanup safety

## Production account cleanup rules

- Classify accounts using the joined Auth user and `public.td_members` record, including stable UUID, role, active state, creation time, internal Auth email, metadata, and sign-in history. A username alone is not sufficient.
- Never delete an `owner` account or an account whose identity is ambiguous.
- Do not delete customer, order, parcel, pickup, payment, archive, hidden-order, deletion-log, or audit-history rows as part of staff cleanup.
- Check foreign-key references and Storage ownership before deleting an Auth user. If business rows reference the user, stop and resolve the references without deleting business history.
- Preserve audit records even when the referenced test account is deleted; they are historical evidence, not employee login records.
- Use an authorized server-side Supabase Auth Admin API or the Supabase Dashboard for Auth user deletion. Never put a service-role/secret key in browser code, repository files, client-visible logs, or public endpoints.
- The public `staff-auth` Edge Function supports login, registration, owner-mediated account creation, and activation status changes. It must not accept account deletion actions or arbitrary lists of user IDs.
- Do not run `docs/PRODUCTION_CLEANUP.sql` for employee cleanup. That file intentionally clears business data and is unrelated to account deletion.

## Verification checklist

1. Record the candidate UUID and evidence before deletion.
2. Confirm the candidate is a non-owner staff member and its Auth identity matches the employee record.
3. Check foreign keys, audit rows, Storage ownership, and business-record references.
4. Delete only the verified Auth user using a server-side administrative mechanism.
5. Re-query Auth users, `td_members`, and `profiles` to ensure no orphaned login/profile records remain.
6. Confirm the owner and all retained staff still exist.
7. Compare customer/order/parcel/pickup/payment and history-table counts before and after.
8. Keep the audit history; do not delete business data to make account deletion succeed.
