import { useRef } from 'react';
import { Upload, X, FileText, Image as ImageIcon } from 'lucide-react';
import { Button } from './button';
import { cn } from './utils';

interface FileUploadProps {
  value?: File[];
  onChange: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  placeholder?: string;
  maxFiles?: number;
  disabled?: boolean;
}

export function FileUpload({
  value = [],
  onChange,
  accept = '.pdf,.jpg,.jpeg,.png',
  multiple = true,
  placeholder = 'Click to upload or drag and drop',
  maxFiles,
  disabled = false,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const fileArray = Array.from(files);
      if (maxFiles && value.length + fileArray.length > maxFiles) {
        return;
      }
      onChange([...value, ...fileArray]);
    }
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const handleRemoveFile = (index: number) => {
    const newFiles = [...value];
    newFiles.splice(index, 1);
    onChange(newFiles);
  };

  const handleClick = () => {
    inputRef.current?.click();
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) {
      return <ImageIcon className="h-4 w-4" />;
    }
    return <FileText className="h-4 w-4" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="space-y-3">
      <div
        onClick={disabled ? undefined : handleClick}
        className={cn(
          'group rounded-[14px] border border-dashed border-input bg-input-background/70 p-6 transition-[border-color,background-color,box-shadow] sm:p-7',
          disabled
            ? 'cursor-not-allowed opacity-50'
            : 'cursor-pointer hover:border-accent/60 hover:bg-accent/5 hover:shadow-[0_1px_0_rgba(0,0,0,0.02)]',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={handleFileChange}
          disabled={disabled}
        />
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/70 bg-background/80 text-muted-foreground transition-colors group-hover:text-foreground">
            <Upload className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground/90">{placeholder}</p>
            <p className="text-xs text-muted-foreground">
              {accept.replace(/\./g, '').toUpperCase()}
              {maxFiles ? ` · Max ${maxFiles} file${maxFiles > 1 ? 's' : ''}` : ''}
            </p>
          </div>
        </div>
      </div>

      {value.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            {value.length} file{value.length > 1 ? 's' : ''} selected
          </p>
          <div className="space-y-2">
            {value.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-3 rounded-xl border border-border/80 bg-card/80 p-3 shadow-[0_1px_0_rgba(0,0,0,0.02)]"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/70 text-muted-foreground">
                  {getFileIcon(file)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                </div>
                {!disabled && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveFile(index);
                    }}
                    className="h-9 w-9 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
