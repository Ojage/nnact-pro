"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/ui/form-select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export interface DocumentPreviewVariant {
  id: string;
  label: string;
  html: string;
}

export interface DocumentPreviewItem {
  id: string;
  label: string;
  html: string;
  variants?: DocumentPreviewVariant[];
}

export function DocumentPreviewWorkbench({
  documents,
  initialDocumentId,
  compact = false,
  fileName = "customer-document.html",
}: {
  documents: DocumentPreviewItem[];
  initialDocumentId?: string;
  compact?: boolean;
  fileName?: string;
}) {
  const [documentId, setDocumentId] = useState(initialDocumentId ?? documents[0]?.id ?? "");
  const [variantId, setVariantId] = useState("");
  const [viewport, setViewport] = useState<"page" | "phone">("page");
  const [zoom, setZoom] = useState(compact ? 50 : 75);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const activeDocument = documents.find((document) => document.id === documentId) ?? documents[0];
  const activeVariant = activeDocument?.variants?.find((variant) => variant.id === variantId) ?? activeDocument?.variants?.[0];
  const html = activeVariant?.html ?? activeDocument?.html ?? "";

  useEffect(() => {
    setVariantId(activeDocument?.variants?.[0]?.id ?? "");
  }, [activeDocument?.id]);

  const downloadHtml = () => {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName.endsWith(".html") ? fileName : `${fileName}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const frameWidth = viewport === "phone" ? 390 : 900;
  const frameHeight = compact ? 1040 : 1120;
  const scale = viewport === "phone" ? 1 : zoom / 100;

  return (
    <Card className="overflow-hidden p-0" data-testid="document-preview-workbench">
      <div className="border-b border-border bg-surface-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-fg">Customer view</h3>
              <span className="rounded-full border border-green/25 bg-green/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-green">Live preview</span>
            </div>
            <p className="mt-1 text-xs text-fg-muted">Changes appear here before they are saved or sent.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              type="single"
              value={viewport}
              onValueChange={(value) => value && setViewport(value as "page" | "phone")}
              className="rounded-lg border border-border bg-surface-200 p-1"
              aria-label="Preview viewport"
            >
              <ToggleGroupItem value="page" className="min-h-8 rounded-md px-2.5 text-xs font-semibold data-[state=on]:bg-surface-50 data-[state=on]:text-fg data-[state=on]:shadow-sm">
                Page
              </ToggleGroupItem>
              <ToggleGroupItem value="phone" className="min-h-8 rounded-md px-2.5 text-xs font-semibold data-[state=on]:bg-surface-50 data-[state=on]:text-fg data-[state=on]:shadow-sm">
                Phone
              </ToggleGroupItem>
            </ToggleGroup>
            {viewport === "page" ? (
              <Label className="flex items-center gap-2 text-xs font-normal text-fg-muted">
                Zoom
                <FormSelect
                  value={String(zoom)}
                  onChange={(value) => setZoom(Number(value))}
                  size="sm"
                  className="w-20"
                  options={[
                    { value: "50", label: "50%" },
                    { value: "75", label: "75%" },
                    { value: "100", label: "100%" },
                  ]}
                />
              </Label>
            ) : null}
            {!compact ? (
              <>
                <Button size="sm" variant="secondary" onClick={() => frameRef.current?.contentWindow?.print()}>Print / PDF</Button>
                <Button size="sm" variant="secondary" onClick={downloadHtml}>Download HTML</Button>
              </>
            ) : null}
          </div>
        </div>

        {documents.length > 1 ? (
          <ToggleGroup
            type="single"
            value={documentId}
            onValueChange={(value) => value && setDocumentId(value)}
            className="mt-4 flex flex-wrap gap-2"
            aria-label="Document type"
          >
            {documents.map((document) => (
              <ToggleGroupItem
                key={document.id}
                value={document.id}
                className="min-h-9 rounded-lg border px-3 text-xs font-semibold data-[state=on]:border-accent data-[state=on]:bg-accent data-[state=on]:text-surface-50"
              >
                {document.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ) : null}

        {activeDocument?.variants?.length ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-fg-muted">Selected option</span>
            <ToggleGroup
              type="single"
              value={activeVariant?.id ?? activeDocument.variants?.[0]?.id ?? ""}
              onValueChange={(value) => value && setVariantId(value)}
              className="flex flex-wrap gap-2"
              aria-label="Estimate option preview"
            >
              {activeDocument.variants.map((variant) => (
                <ToggleGroupItem
                  key={variant.id}
                  value={variant.id}
                  className="min-h-8 rounded-md border px-2.5 text-xs font-semibold data-[state=on]:border-accent data-[state=on]:bg-accent-muted data-[state=on]:text-accent"
                >
                  {variant.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        ) : null}
      </div>

      <div className="max-h-[860px] overflow-auto bg-surface-300 p-3 sm:p-5" aria-label="Document preview canvas">
        <div className="mx-auto overflow-hidden rounded-xl bg-white shadow-[0_18px_45px_rgba(17,24,39,0.14)]" style={{ width: frameWidth * scale, height: frameHeight * scale }}>
          <iframe
            ref={frameRef}
            title={`${activeDocument?.label ?? "Document"} customer preview${activeVariant ? ` - ${activeVariant.label}` : ""}`}
            srcDoc={html}
            className="origin-top-left border-0 bg-white"
            style={{ width: frameWidth, height: frameHeight, transform: `scale(${scale})` }}
          />
        </div>
      </div>
    </Card>
  );
}
