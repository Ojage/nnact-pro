import { useRef } from 'react';
import { Upload, X, FileText, Image as ImageIcon } from 'lucide-react';
import { Button } from './button';

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
    // Reset input value to allow selecting the same file again
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
      return <ImageIcon className="w-4 h-4" />;
    }
    return <FileText className="w-4 h-4" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="space-y-3">
      {/* Upload Area */}
      <div
        onClick={disabled ? undefined : handleClick}
        className={`border-2 border-dashed rounded-md p-6 transition-colors ${
          disabled
            ? 'border-border bg-muted cursor-not-allowed opacity-50'
            : 'border-border hover:border-primary cursor-pointer'
        }`}
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
        <div className="flex flex-col items-center gap-2 text-center">
          <Upload className="w-8 h-8 text-muted-foreground" />
          <div>
            <p className="text-sm text-muted-foreground">{placeholder}</p>
            {maxFiles && (
              <p className="text-xs text-muted-foreground mt-1">
                Max {maxFiles} file{maxFiles > 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* File List */}
      {value.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm">
            {value.length} file{value.length > 1 ? 's' : ''} selected
          </p>
          <div className="space-y-2">
            {value.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-3 border border-border rounded-md bg-card"
              >
                <div className="text-muted-foreground">{getFileIcon(file)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.size)}
                  </p>
                </div>
                {!disabled && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveFile(index);
                    }}
                    className="h-8 w-8 p-0"
                  >
                    <X className="w-4 h-4 text-destructive" />
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
