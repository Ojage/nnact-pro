/**
 * Reusable Autocomplete Input Component
 * Features: debounced search, keyboard navigation, dropdown, loading states
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import { Input } from './input';
import { Loader2, ChevronDown, X, Search } from 'lucide-react';
import { cn } from './utils';

export interface AutocompleteOption<T = unknown> {
  id: string;
  label: string;
  value: string;
  data?: T;
  subtitle?: string;
  badge?: string;
}

export interface AutocompleteInputProps<T = unknown> {
  value: string;
  onChange: (value: string, option?: AutocompleteOption<T>) => void;
  onSearch: (query: string) => Promise<AutocompleteOption<T>[]>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  dropdownClassName?: string;
  optionClassName?: string;
  leadingIcon?: ReactNode;
  renderOption?: (option: AutocompleteOption<T>) => React.ReactNode;
  minQueryLength?: number;
  debounceMs?: number;
  emptyMessage?: string;
  loadingMessage?: string;
}

export function AutocompleteInput<T = unknown>({
  value,
  onChange,
  onSearch,
  placeholder,
  disabled = false,
  className,
  inputClassName,
  dropdownClassName,
  optionClassName,
  leadingIcon,
  renderOption,
  minQueryLength = 2,
  debounceMs = 300,
  emptyMessage = 'No results found',
  loadingMessage = 'Searching...',
}: AutocompleteInputProps<T>) {
  const [query, setQuery] = useState(value);
  const [options, setOptions] = useState<AutocompleteOption<T>[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const activeSearchIdRef = useRef(0);

  // Sync external value changes
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Debounced search
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!query || query.trim().length < minQueryLength) {
      setIsLoading(false);
      setError(null);
      setOptions([]);
      setIsOpen(false);
      return;
    }

    debounceTimerRef.current = setTimeout(async () => {
      const searchId = ++activeSearchIdRef.current;
      setIsLoading(true);
      setError(null);
      setIsOpen(true);
      try {
        const results = await onSearch(query.trim());
        if (activeSearchIdRef.current !== searchId) {
          return;
        }
        setOptions(results);
        setIsOpen(true);
        setHighlightedIndex(-1);
      } catch (err: unknown) {
        if (activeSearchIdRef.current !== searchId) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Search failed');
        setOptions([]);
        setIsOpen(false);
      } finally {
        if (activeSearchIdRef.current === searchId) {
          setIsLoading(false);
        }
      }
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query, onSearch, minQueryLength, debounceMs]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setQuery(newValue);
    onChange(newValue);
  };

  const handleSelect = useCallback(
    (option: AutocompleteOption<T>) => {
      setQuery(option.value);
      onChange(option.value, option);
      setIsOpen(false);
      setHighlightedIndex(-1);
      inputRef.current?.blur();
    },
    [onChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || options.length === 0) {
      if (e.key === 'Enter' && query) {
        // Allow Enter to submit if no dropdown is open
        return;
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < options.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < options.length) {
          handleSelect(options[highlightedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setHighlightedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  const handleClear = () => {
    setQuery('');
    onChange('');
    setOptions([]);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const defaultRenderOption = (option: AutocompleteOption<T>) => (
    <div className="flex items-start gap-3">
      <Search className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3">
          <span className="truncate font-medium">{option.label}</span>
          {option.badge && (
            <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
              {option.badge}
            </span>
          )}
        </div>
        {option.subtitle && (
          <span className="mt-0.5 text-xs text-muted-foreground">
            {option.subtitle}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className={cn('relative w-full', className)}>
      <div className="relative">
        <Input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (options.length > 0) {
              setIsOpen(true);
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            'h-12 border-slate-200 bg-white pr-12 text-[15px] shadow-[0_14px_32px_-24px_rgba(15,23,42,0.45)] transition-all focus-visible:ring-2 focus-visible:ring-indigo-400 dark:border-slate-700 dark:bg-slate-950',
            isOpen
              ? 'rounded-t-[32px] rounded-b-none border-b-transparent shadow-[0_18px_40px_-28px_rgba(15,23,42,0.4)]'
              : 'rounded-[32px]',
            leadingIcon ? 'pl-16' : '',
            inputClassName,
          )}
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        />
        {leadingIcon && (
          <div className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2">
            {leadingIcon}
          </div>
        )}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {isLoading && (
            <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
          )}
          {!isLoading && query && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground dark:hover:bg-slate-800"
              aria-label="Clear"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {!isLoading && !query && (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {isOpen && (
        <div
          ref={dropdownRef}
          className={cn(
            'absolute z-50 top-full mt-0 max-h-80 w-full overflow-auto rounded-b-[32px] rounded-t-none border border-t-0 border-slate-200 bg-white p-2 shadow-[0_28px_80px_-28px_rgba(15,23,42,0.45)] dark:border-slate-800 dark:bg-slate-950',
            dropdownClassName,
          )}
          role="listbox"
        >
          {isLoading && (
            <div className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {loadingMessage}
            </div>
          )}

          {!isLoading && options.length === 0 && query.length >= minQueryLength && (
            <div className="px-4 py-4 text-sm text-muted-foreground">
              {emptyMessage}
            </div>
          )}

          {!isLoading && options.length > 0 && (
            <div className="py-1">
              {options.map((option, index) => (
                <div
                  key={option.id}
                  onClick={() => handleSelect(option)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={cn(
                    'cursor-pointer rounded-2xl px-4 py-3 text-sm transition-all',
                    highlightedIndex === index
                      ? 'bg-indigo-50 text-indigo-950 shadow-sm dark:bg-indigo-950/50 dark:text-indigo-50'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-900/70',
                    optionClassName,
                  )}
                  role="option"
                  aria-selected={highlightedIndex === index}
                >
                  {renderOption ? renderOption(option) : defaultRenderOption(option)}
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

































