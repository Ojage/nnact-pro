
import * as React from "react"
import { Check, ChevronsUpDown, Plus, X } from "lucide-react"
import { cn } from "../../lib/utils"
import { Button } from "./button"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from "./command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "./popover"
import { Badge } from "./badge"
import { useState } from "react"

export type Option = {
    label: string
    value: string
}

interface MultiSelectProps {
    options: Option[]
    selected: string[]
    onChange: (selected: string[]) => void
    placeholder?: string
    searchPlaceholder?: string
    className?: string
    allowCreate?: boolean
    onCreate?: (value: string) => void
}

export function MultiSelect({
    options,
    selected,
    onChange,
    placeholder = "Select options...",
    searchPlaceholder = "Search...",
    className,
    allowCreate = false,
    onCreate,
}: MultiSelectProps) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState("")

    const handleUnselect = (item: string) => {
        onChange(selected.filter((i) => i !== item))
    }

    const normalized = search.trim().toLowerCase()
    const matches = options.filter(
        (o) => o.label.toLowerCase().includes(normalized) || o.value.toLowerCase().includes(normalized),
    )
    const canCreate =
        allowCreate &&
        normalized.length > 0 &&
        !options.some((o) => o.label.toLowerCase() === normalized || o.value.toLowerCase() === normalized)

    const createValue = () => {
        if (!canCreate || !onCreate) return
        onCreate(search.trim())
        setSearch("")
        setOpen(true)
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn("h-auto min-h-11 w-full justify-between rounded-xl border-input bg-input-background px-4 py-2 text-fg hover:bg-accent-muted hover:text-fg focus-visible:ring-4 focus-visible:ring-accent/15", className)}
                    onClick={() => setOpen(!open)}
                >
                    <div className="flex flex-wrap items-center gap-1.5">
                        {selected.length === 0 && (
                            <span className="font-normal text-fg-muted">{placeholder}</span>
                        )}
                        {selected.map((item) => {
                            const option = options.find((o) => o.value === item)
                            return (
                                <Badge variant="secondary" key={item} className="mb-1 mr-1 rounded-lg border-transparent bg-accent-muted px-2.5 py-1 text-fg hover:bg-accent-hover" onClick={(e) => {
                                    e.stopPropagation();
                                    handleUnselect(item);
                                }}>
                                    {option?.label || item}
                                    <X className="ml-1 h-3 w-3 text-fg-muted hover:text-fg" />
                                </Badge>
                            )
                        })}
                    </div>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-fg-muted opacity-70" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full rounded-[18px] border-border bg-card p-2 text-fg shadow-[0_18px_50px_rgba(0,0,0,0.16)]" align="start">
                <Command shouldFilter={false} className="rounded-[18px] bg-card text-fg">
                    <CommandInput
                        placeholder={searchPlaceholder}
                        value={search}
                        onValueChange={setSearch}
                        className="text-fg placeholder:text-fg-muted"
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && canCreate) {
                                e.preventDefault()
                                createValue()
                            }
                        }}
                    />
                    <CommandList>
                        <CommandEmpty className="text-fg-muted">
                            {canCreate
                                ? `Press Enter to create "${search.trim()}"`
                                : "No results found."}
                        </CommandEmpty>
                        {matches.length > 0 && (
                            <CommandGroup className="max-h-64 overflow-auto p-1.5">
                                {matches.map((option) => (
                                    <CommandItem
                                        key={option.value}
                                        value={option.label}
                                        className="rounded-xl px-3 py-2.5 text-fg data-[selected=true]:bg-accent-muted data-[selected=true]:text-fg [&_svg]:text-fg"
                                        onSelect={() => {
                                            if (selected.includes(option.value)) handleUnselect(option.value)
                                            else onChange([...selected, option.value])
                                            setOpen(true)
                                        }}
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-4 w-4 text-fg",
                                                selected.includes(option.value)
                                                    ? "opacity-100"
                                                    : "opacity-0"
                                            )}
                                        />
                                        {option.label}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}
                        {canCreate && (
                            <>
                                {matches.length > 0 && <CommandSeparator className="-mx-1.5 my-1.5 bg-border" />}
                                <CommandGroup className="p-1.5">
                                    <CommandItem value="__create__" onSelect={createValue} className="rounded-xl px-3 py-2.5 text-fg data-[selected=true]:bg-accent-muted data-[selected=true]:text-fg [&_svg]:text-fg">
                                        <Plus className="mr-2 h-4 w-4" />
                                        Create "{search.trim()}"
                                    </CommandItem>
                                </CommandGroup>
                            </>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
