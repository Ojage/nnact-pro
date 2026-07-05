# Documents

OpenFieldPro documents use a shared HTML renderer in `packages/shared/src/documents.ts`.

## Implemented surfaces

- Document hub: `/documents`
- Generic renderer preview: `/documents/preview`
- Invoice preview: `/invoices/:id/preview`
- Invoice HTML export: `/invoices/:id/document.html`
- Estimate preview: `/estimates/:id/preview`
- Estimate HTML export: `/estimates/:id/document.html`
- Organization branding settings: `/settings` → General & Branding

## Current capability

The renderer supports these document kinds:

- estimate
- invoice
- receipt
- work order
- service plan

The current implementation renders HTML and supports browser print/save-as-PDF. This keeps the first version dependency-light and self-host friendly.

## Branding behavior

Every document accepts a `branding` object with:

- company name
- optional logo URL
- brand color
- footer text
- attribution removal flag

The invoice and estimate preview/export routes now pull organization branding from `/api/org/me`, so customer-facing documents reflect the organization name, brand color, footer, optional logo, and attribution setting.

Free installs can keep the OpenFieldPro attribution. Pro can remove it and apply company branding.

## API surfaces

- `GET /api/org/me` returns the current organization settings.
- `PATCH /api/org/me` updates name, timezone, public contact fields, document branding, and attribution removal.

## Next production layer

1. Add server-side PDF rendering using the same HTML renderer.
2. Add email delivery for estimates, invoices, receipts, and service-plan summaries.
3. Persist document-send history and customer-visible portal links.
4. Add signed public links for customer-facing document access.
5. Add per-document template variants for Pro.

## Notes

The direct HTML routes are intended as a stable intermediate export layer. Any future PDF service should call the same `renderFieldDocumentHtml` helper so PDF, portal, email, and print views stay visually consistent.
