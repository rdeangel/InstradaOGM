"use client"

import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon, Clock } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TimeInput } from "@/components/ui/time-input"
import { isValidHhMm } from "@/lib/time-input"
import { useCoarsePointer, useIsPhone } from "@/hooks/use-mobile"

interface DateTimePickerProps {
    date: Date | undefined
    setDate: (date: Date | undefined) => void
    disabled?: boolean
}

function toDateInputValue(d: Date): string {
    return format(d, "yyyy-MM-dd")
}

export function DateTimePicker({ date, setDate, disabled }: DateTimePickerProps) {
    const isPhone = useIsPhone()
    const isCoarse = useCoarsePointer()
    const useNative = isPhone || isCoarse

    const [selectedDateTime, setSelectedDateTime] = React.useState<Date | undefined>(date)

    // Sync with external prop changes only
    React.useEffect(() => {
        setSelectedDateTime(date)
    }, [date])

    const timeValue = selectedDateTime ? format(selectedDateTime, "HH:mm") : ""

    const applyDateKeepingTime = (selectedDate: Date) => {
        const newDateTime = new Date(selectedDate)
        if (isValidHhMm(timeValue)) {
            const [h, m] = timeValue.split(":").map(Number)
            newDateTime.setHours(h, m, 0, 0)
        } else if (selectedDateTime) {
            newDateTime.setHours(selectedDateTime.getHours(), selectedDateTime.getMinutes(), 0, 0)
        } else {
            const now = new Date()
            newDateTime.setHours(now.getHours(), now.getMinutes(), 0, 0)
        }
        setSelectedDateTime(newDateTime)
        setDate(newDateTime)
    }

    const handleDateSelect = (selectedDate: Date | undefined) => {
        if (!selectedDate) {
            setSelectedDateTime(undefined)
            setDate(undefined)
            return
        }
        applyDateKeepingTime(selectedDate)
    }

    const handleNativeDateChange = (raw: string) => {
        if (!raw) {
            setSelectedDateTime(undefined)
            setDate(undefined)
            return
        }
        const [year, month, day] = raw.split("-").map(Number)
        if (!year || !month || !day) return
        applyDateKeepingTime(new Date(year, month - 1, day))
    }

    const handleTimeChange = (normalized: string) => {
        if (!selectedDateTime) return
        const [h, m] = normalized.split(":").map(Number)
        const newDateTime = new Date(selectedDateTime)
        newDateTime.setHours(h, m, 0, 0)
        setSelectedDateTime(newDateTime)
        setDate(newDateTime)
    }

    if (useNative) {
        return (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                    <Label htmlFor="datetime-date" className="text-xs text-muted-foreground">
                        Date
                    </Label>
                    <Input
                        id="datetime-date"
                        type="date"
                        disabled={disabled}
                        value={selectedDateTime ? toDateInputValue(selectedDateTime) : ""}
                        onChange={(e) => handleNativeDateChange(e.target.value)}
                    />
                </div>
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                    <Label htmlFor="datetime-time" className="text-xs text-muted-foreground">
                        Time
                    </Label>
                    <TimeInput
                        id="datetime-time"
                        value={timeValue}
                        onChange={handleTimeChange}
                        disabled={disabled || !selectedDateTime}
                    />
                </div>
            </div>
        )
    }

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant={"outline"}
                    className={cn(
                        "w-full justify-start text-left font-normal",
                        !date && "text-muted-foreground"
                    )}
                    disabled={disabled}
                >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "PPP HH:mm") : <span>Pick a date</span>}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                    mode="single"
                    selected={selectedDateTime}
                    onSelect={handleDateSelect}
                    initialFocus
                />
                <div className="p-3 border-t border-border">
                    <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <Label htmlFor="time" className="text-sm font-medium">Time</Label>
                        <TimeInput
                            id="time"
                            className="h-8"
                            value={timeValue}
                            onChange={handleTimeChange}
                            disabled={disabled || !selectedDateTime}
                        />
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    )
}
