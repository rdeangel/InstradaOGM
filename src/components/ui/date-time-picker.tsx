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

export function DateTimePicker({ date, setDate, disabled }: DateTimePickerProps) {
    const [selectedDateTime, setSelectedDateTime] = React.useState<Date | undefined>(date)

    // Sync internal state with prop
    React.useEffect(() => {
        setSelectedDateTime(date)
    }, [date])

    const handleDateSelect = (selectedDate: Date | undefined) => {
        if (!selectedDate) {
            setSelectedDateTime(undefined)
            setDate(undefined)
            return
        }

        const newDateTime = new Date(selectedDate)
        if (selectedDateTime) {
            newDateTime.setHours(selectedDateTime.getHours())
            newDateTime.setMinutes(selectedDateTime.getMinutes())
        } else {
            // Default to current time if no time was previously selected
            const now = new Date()
            newDateTime.setHours(now.getHours())
            newDateTime.setMinutes(now.getMinutes())
        }
        setSelectedDateTime(newDateTime)
        setDate(newDateTime)
    }

    const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const timeStr = e.target.value
        if (!selectedDateTime || !timeStr) return

        const [hours, minutes] = timeStr.split(':').map(Number)
        if (isNaN(hours) || isNaN(minutes)) return

        const newDateTime = new Date(selectedDateTime)
        newDateTime.setHours(hours)
        newDateTime.setMinutes(minutes)

        setSelectedDateTime(newDateTime)
        setDate(newDateTime)
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
                            type="time"
                            className="h-8"
                            value={selectedDateTime ? format(selectedDateTime, 'HH:mm') : ''}
                            onChange={handleTimeChange}
                            disabled={!selectedDateTime}
                        />
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    )
}
