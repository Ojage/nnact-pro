/**
 * DownloadReportButton
 *
 * A single split-button that exposes all available download formats through a
 * dropdown menu. Replaces the previous pattern of two or three separate
 * "Download PDF" / "Download XBRL" / "View Details" buttons that occupied
 * horizontal space in every report row.
 *
 * Usage:
 *   <DownloadReportButton
 *     onDownload={(fmt) => handleDownload(reportCode, fmt)}
 *     formats={['PDF', 'Excel', 'XBRL']}
 *   />
 *
 * Props:
 *   onDownload  — called with the chosen format string when the user selects an
 *                 item from the dropdown. May be async; the button shows a spinner
 *                 while the promise is pending.
 *   formats     — ordered list of formats to expose (defaults to all four).
 *   size        — 'sm' (default) | 'default' — forwarded to the Button component.
 *   label       — override the button label (defaults to "Download").
 *   disabled    — disables the trigger entirely.
 *   className   — extra Tailwind classes applied to the trigger button.
 */

import * as React from 'react';
import { ChevronDown, Download, FileSpreadsheet, FileText, FileCode, FileDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu';
import { Button } from './button';
import { cn } from './utils';

// ============================================================================
// Types
// ============================================================================

export type DownloadFormat = 'PDF' | 'Excel' | 'XBRL' | 'CSV' | 'XML' | 'JSON';

export interface DownloadReportButtonProps {
  onDownload: (format: DownloadFormat) => void | Promise<void>;
  formats?: DownloadFormat[];
  size?: 'sm' | 'default';
  label?: string;
  disabled?: boolean;
  className?: string;
}

// ============================================================================
// Format metadata — icon, label, description shown in the dropdown item
// ============================================================================

const FORMAT_META: Record<DownloadFormat, {
  icon: React.ElementType;
  label: string;
  description: string;
}> = {
  PDF: {
    icon: FileText,
    label: 'PDF',
    /**
     * Description clarifies the PDF is rendered via the backend
     * Handlebars + Puppeteer pipeline, not a client-side conversion.
     * This sets the right expectation for layout fidelity.
     */
    description: 'Formatted regulatory filing',
  },
  Excel: {
    icon: FileSpreadsheet,
    label: 'Excel (.xlsx)',
    /**
     * Styled multi-sheet workbook produced client-side via SheetJS.
     * Each report section becomes a separate named sheet with
     * branded headers, alternating row colours, and totals rows.
     */
    description: 'Styled multi-sheet workbook',
  },
  XBRL: {
    icon: FileCode,
    label: 'XBRL',
    /**
     * COBAC SPECTRA 4.0 XML package. Suitable for regulatory submission
     * once validated against the COBAC taxonomy.
     */
    description: 'COBAC SPECTRA 4.0 XML',
  },
  CSV: {
    icon: FileDown,
    label: 'CSV',
    /** Plain comma-separated export — useful for data analysis pipelines. */
    description: 'Raw data, comma-separated',
  },
  XML: {
    icon: FileCode,
    label: 'XML',
    description: 'Regulatory submission package',
  },
  JSON: {
    icon: FileCode,
    label: 'JSON',
    description: 'Structured machine-readable export',
  },
};

const DEFAULT_FORMATS: DownloadFormat[] = ['PDF', 'Excel', 'XBRL'];

// ============================================================================
// Component
// ============================================================================

export function DownloadReportButton({
  onDownload,
  formats = DEFAULT_FORMATS,
  size = 'sm',
  label = 'Download',
  disabled = false,
  className,
}: DownloadReportButtonProps) {
  const [pendingFormat, setPendingFormat] = React.useState<DownloadFormat | null>(null);

  const handleSelect = async (format: DownloadFormat) => {
    if (pendingFormat !== null) return; // prevent concurrent downloads
    setPendingFormat(format);
    try {
      await onDownload(format);
    } finally {
      setPendingFormat(null);
    }
  };

  const isLoading = pendingFormat !== null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size={size}
          variant="outline"
          disabled={disabled || isLoading}
          className={cn('flex items-center gap-1.5', className)}
        >
          {isLoading ? (
            /**
             * Spinner shown while the download promise is resolving.
             * Uses a pure CSS border-spin animation defined by the
             * Tailwind `animate-spin` utility — no extra dependency.
             */
            <span
              className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin"
              aria-hidden="true"
            />
          ) : (
            <Download className="h-3 w-3" aria-hidden="true" />
          )}
          {isLoading ? `Generating ${pendingFormat}…` : label}
          <ChevronDown className="h-3 w-3 opacity-60" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-56">
        {formats.map((fmt, idx) => {
          const meta  = FORMAT_META[fmt];
          const Icon  = meta.icon;
          const isBusy = pendingFormat === fmt;

          return (
            <React.Fragment key={fmt}>
              {/* Separator before CSV to visually group it as a "raw" option */}
              {fmt === 'CSV' && idx > 0 && <DropdownMenuSeparator />}

              <DropdownMenuItem
                onSelect={() => handleSelect(fmt)}
                disabled={isLoading}
                className="flex items-start gap-3 py-2.5 cursor-pointer"
              >
                {/* Format icon */}
                <span className="mt-0.5 shrink-0">
                  {isBusy ? (
                    <span
                      className="block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Icon className="h-4 w-4 text-[--color-fg-muted]" aria-hidden="true" />
                  )}
                </span>

                {/* Label + description */}
                <span className="flex flex-col min-w-0">
                  <span className="text-sm font-medium leading-tight">{meta.label}</span>
                  <span className="text-xs text-[--color-fg-muted] leading-tight mt-0.5">
                    {meta.description}
                  </span>
                </span>
              </DropdownMenuItem>
            </React.Fragment>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
