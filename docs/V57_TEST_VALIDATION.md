# V57 bounded regression checks

This change adds test safeguards only. It does not deploy database changes.

- The disposable PostgreSQL runner injects a failure after the V57 DDL and grants but before commit, then asserts that no V57 objects survive and the original ledger function and shared-schema permissions are unchanged.
- The runner reproduces broad legacy marker-table grants, applies the narrow TRUNCATE repair twice, checks effective privileges and preserves SELECT access, then runs the existing intake, duplicate-prevention, checkout, permission and rollback checks.
- Both database connections have statement, lock and idle-transaction timeouts. CI jobs have explicit outer time limits.
- The reviewed SQL is outside the migration directory. It is not applied by CI or site deployment and requires separate authorization before any production use.

Validation before submission: 107 Node tests, JavaScript syntax checks, static build, disposable PostgreSQL regression and Chromium scanner regression passed. Chromium uses generated barcode images with mocked media and business transport; it is not physical-device acceptance.

Private environment observations, backup status, customer/financial data and credentials are excluded from this document and commit. Deployment readiness and any live-system authorization are handled separately.
