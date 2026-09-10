
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
                    className={cn("w-full justify-between h-auto min-h-10 hover:bg-transparent", className)}
                    onClick={() => setOpen(!open)}
                >
                    <div className="flex flex-wrap gap-1">
                        {selected.length === 0 && (
                            <span className="text-muted-foreground font-normal">{placeholder}</span>
                        )}
                        {selected.map((item) => {
                            const option = options.find((o) => o.value === item)
                            return (
                                <Badge variant="secondary" key={item} className="mr-1 mb-1" onClick={(e) => {
                                    e.stopPropagation();
                                    handleUnselect(item);
                                }}>
                                    {option?.label || item}
                                    <X className="ml-1 h-3 w-3 text-muted-foreground hover:text-foreground" />
                                </Badge>
                            )
                        })}
                    </div>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0" align="start">
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder={searchPlaceholder}
                        value={search}
                        onValueChange={setSearch}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && canCreate) {
                                e.preventDefault()
                                createValue()
                            }
                        }}
                    />
                    <CommandList>
                        <CommandEmpty>
                            {canCreate
                                ? `Press Enter to create "${search.trim()}"`
                                : "No results found."}
                        </CommandEmpty>
                        {matches.length > 0 && (
                            <CommandGroup className="max-h-64 overflow-auto">
                                {matches.map((option) => (
                                    <CommandItem
                                        key={option.value}
                                        value={option.label}
                                        onSelect={() => {
                                            if (selected.includes(option.value)) handleUnselect(option.value)
                                            else onChange([...selected, option.value])
                                            setOpen(true)
                                        }}
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-4 w-4",
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
                                {matches.length > 0 && <CommandSeparator />}
                                <CommandGroup>
                                    <CommandItem value="__create__" onSelect={createValue}>
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
