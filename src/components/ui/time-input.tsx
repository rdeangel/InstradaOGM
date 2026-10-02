"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { useCoarsePointer, useIsPhone } from "@/hooks/use-mobile"
import { normalizeTimeInput } from "@/lib/time-input"

export interface TimeInputProps {
  value: string
  onChange: (normalizedHhMm: string) => void
  className?: string
  id?: string
  disabled?: boolean
  placeholder?: string
}

/** Strip optional seconds from native `type="time"` values (`HH:MM:SS` → `HH:MM`). */
function fromNativeTimeValue(raw: string): string | null {
  if (!raw) return null
  const parts = raw.split(":")
  if (parts.length < 2) return null
  return normalizeTimeInput(`${parts[0]}:${parts[1]}`)
}

export function TimeInput({
  value,
  onChange,
  className,
  id,
  disabled,
  placeholder = "HH:MM",
}: TimeInputProps) {
  const isPhone = useIsPhone()
  const isCoarse = useCoarsePointer()
  const useNative = isPhone || isCoarse

  const [draft, setDraft] = React.useState(value)
  const [focused, setFocused] = React.useState(false)

  React.useEffect(() => {
    if (!focused) setDraft(value)
  }, [value, focused])

  const commitDraft = React.useCallback(() => {
    const normalized = normalizeTimeInput(draft)
    if (normalized) {
      setDraft(normalized)
      if (normalized !== value) onChange(normalized)
    } else {
      setDraft(value)
    }
  }, [draft, onChange, value])

  if (useNative) {
    return (
      <Input
        id={id}
        type="time"
        className={cn(className)}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const normalized = fromNativeTimeValue(e.target.value)
          if (normalized && normalized !== value) onChange(normalized)
        }}
      />
    )
  }

  return (
    <Input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      className={cn(className)}
      value={draft}
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        const next = e.target.value
        // Allow progressive typing of H:MM / HH:MM without forcing pad mid-edit
        // eslint-disable-next-line security/detect-unsafe-regex -- Safe: simple time format validation
        if (next === "" || /^\d{0,2}(:\d{0,2})?$/.test(next)) {
          setDraft(next)
          const normalized = normalizeTimeInput(next)
          if (normalized && normalized !== value) onChange(normalized)
        }
      }}
      onBlur={() => {
        setFocused(false)
        commitDraft()
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          commitDraft()
          ;(e.target as HTMLInputElement).blur()
        }
      }}
    />
  )
}
