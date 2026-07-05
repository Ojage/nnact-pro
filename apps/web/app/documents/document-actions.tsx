"use client";

import { Button } from "@/components/ui/button";

export function DocumentActions({ html, fileName }: { html: string; fileName: string }) {
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

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => window.print()}>
        Print / Save as PDF
      </Button>
      <Button size="sm" variant="secondary" onClick={downloadHtml}>
        Download HTML
      </Button>
    </div>
  );
}
