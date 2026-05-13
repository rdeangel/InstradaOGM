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

interface DateTimePickerProps {
    date: Date | undefined
    setDate: (date: Date | undefined) => void
    disabled?: boolean
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export function DateTimePicker({ date, setDate, disabled }: DateTimePickerProps) {
    const [selectedDateTime, setSelectedDateTime] = React.useState<Date | undefined>(date)
    const [timeInput, setTimeInput] = React.useState<string>(date ? format(date, 'HH:mm') : '')

    // Sync with external prop changes only
    React.useEffect(() => {
        setSelectedDateTime(date)
        setTimeInput(date ? format(date, 'HH:mm') : '')
    }, [date])

    const handleDateSelect = (selectedDate: Date | undefined) => {
        if (!selectedDate) {
            setSelectedDateTime(undefined)
            setDate(undefined)
            setTimeInput('')
            return
        }

        const newDateTime = new Date(selectedDate)
        // Preserve the typed time if valid, else fall back to current or now
        if (TIME_RE.test(timeInput)) {
            const [h, m] = timeInput.split(':').map(Number)
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

    const handleTimeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        // eslint-disable-next-line security/detect-unsafe-regex -- Safe: simple time format validation
        if (val === '' || /^\d{0,2}(:\d{0,2})?$/.test(val)) {
            setTimeInput(val)
            // Commit to Date only when a complete valid time is entered
            if (TIME_RE.test(val) && selectedDateTime) {
                const [h, m] = val.split(':').map(Number)
                const newDateTime = new Date(selectedDateTime)
                newDateTime.setHours(h, m, 0, 0)
                setSelectedDateTime(newDateTime)
                setDate(newDateTime)
            }
        }
    }

    const handleTimeBlur = () => {
        if (!TIME_RE.test(timeInput)) {
            setTimeInput(selectedDateTime ? format(selectedDateTime, 'HH:mm') : '')
        }
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
                        <Input
                            id="time"
                            type="text"
                            inputMode="numeric"
                            placeholder="HH:MM"
                            className="h-8"
                            value={timeInput}
                            onChange={handleTimeInputChange}
                            onBlur={handleTimeBlur}
                            disabled={!selectedDateTime}
                        />
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    )
}
