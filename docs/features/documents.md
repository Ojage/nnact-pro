# Documents

NnactPro documents use a shared HTML renderer in `packages/shared/src/documents.ts`.

## Implemented surfaces

- Document hub: `/documents`
- Template preview: `/documents/preview`
- Invoice preview: `/invoices/:id/preview`
- Invoice HTML export: `/invoices/:id/document.html`
- Estimate preview: `/estimates/:id/preview`
- Estimate HTML export: `/estimates/:id/document.html`
- Organization branding settings: `/settings` → Company, Invoices, Estimates

## Renderer pipeline

1. **Data assembly** — `invoiceDocumentData()` / `estimateDocumentData()` in `@nnact/shared` merge invoice/estimate rows, customer, job, line items, org branding, and visibility settings.
2. **HTML** — `renderFieldDocumentHtml()` produces the customer-facing layout used by web previews and exports.
3. **PDF** — the API renders the same HTML with Puppeteer (Chromium) and stores the bytes in the `documents` table for download and email attachments.

Regenerate stored PDFs from the Documents hub after changing branding or template settings so existing artifacts pick up the new layout.

## Branding behavior

Every document accepts a `branding` object with:

- company name
- optional logo URL (uploaded logos are inlined as data URLs for PDF rendering)
- brand color
- footer text
- public contact fields
- attribution removal flag

Invoice and estimate previews pull organization settings from `/api/org/me`, including default messages, payment instructions, visibility toggles, and customer view format (`email` vs `envelope`).

## API surfaces

- `GET /api/org/me` — organization settings
- `PATCH /api/org/me` — update branding and business settings
- `GET /api/invoices/:id/document` — stored PDF (generated on first request)
- `GET /api/estimates/:id/document` — stored PDF (generated on first request)
- `POST /api/invoices|estimates/:id/document/regenerate` — rebuild PDF from current data and settings

## Production requirements

- **Chromium** for PDF generation (`PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` in Docker)
- **Regenerate** after template changes; stored PDFs are immutable until regenerated
