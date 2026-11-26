import * as React from "react";
import { motion } from "framer-motion";
import { cva, type VariantProps } from "class-variance-authority";
import { X, File, CheckCircle2 } from "lucide-react";

import { cn } from "./utils";
import { Progress } from "./progress";
import { Button } from "./button";

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

const cardVariants = cva(
  "relative flex w-full items-center gap-4 overflow-hidden rounded-[14px] border bg-card/85 p-4 text-card-foreground shadow-[0_1px_0_rgba(0,0,0,0.02)] transition-[border-color,background-color,box-shadow]",
  {
    variants: {
      status: {
        uploading: "border-border/80",
        complete: "border-[--color-success-emphasis]/30 bg-[--color-success-subtle]/20",
        error: "border-destructive/30 bg-destructive/5",
      },
    },
    defaultVariants: {
      status: "uploading",
    },
  }
);

export interface UploadProgressCardProps extends VariantProps<typeof cardVariants> {
  fileName: string;
  fileSize: number;
  progress: number;
  icon?: React.ReactNode;
  onCancel: () => void;
  className?: string;
}

const UploadProgressCard = React.forwardRef<HTMLDivElement, UploadProgressCardProps>(
  ({ className, status, fileName, fileSize, progress, icon, onCancel }, ref) => {
    const uploadedSize = (fileSize * progress) / 100;
    const isComplete = progress === 100;

    return (
      <motion.div
        ref={ref}
        className={cn(cardVariants({ status }), className)}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, transition: { duration: 0.2 } }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
      >
        <div className="shrink-0 text-muted-foreground">
          {isComplete ? (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[--color-success-subtle] text-[--color-success-fg]">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/70 text-muted-foreground">
              {icon || <File className="h-5 w-5" />}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{fileName}</p>
          <div className="mt-2 space-y-1.5">
            <Progress value={progress} className="h-2 bg-muted/80 [&_[data-slot=progress-indicator]]:bg-accent" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {isComplete
                  ? formatFileSize(fileSize)
                  : `${formatFileSize(uploadedSize)} of ${formatFileSize(fileSize)}`}
              </span>
              <span className={cn("tabular-nums", isComplete && "font-medium text-[--color-success-fg]")}>
                {isComplete ? "Complete" : `${Math.round(progress)}%`}
              </span>
            </div>
          </div>
        </div>

        {!isComplete && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-lg text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            onClick={onCancel}
            aria-label="Cancel upload"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </motion.div>
    );
  }
);

UploadProgressCard.displayName = "UploadProgressCard";

export { UploadProgressCard };
