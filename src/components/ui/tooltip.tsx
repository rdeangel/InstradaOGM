"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"
import { useTouchDevice } from "@/hooks/use-touch-device"

// Original Radix UI components for backward compatibility
const TooltipProvider = TooltipPrimitive.Provider
const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, style, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md dark:shadow-[0_0_15px_-3px_rgba(255,255,255,0.1)] animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        // Force full opacity and ensure text color is not inherited from disabled parents
        "!opacity-100 !text-popover-foreground !bg-popover",
        className
      )}
      style={{
        opacity: 1,
        color: 'hsl(var(--popover-foreground))',
        backgroundColor: 'hsl(var(--popover))',
        zIndex: 9999,
        ...style
      }}
      {...props}
    />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

// Enhanced Tooltip component with touch support
interface TouchAwareTooltipProps {
  children: React.ReactNode
  delayDuration?: number
  skipDelayDuration?: number
  disableHoverableContent?: boolean
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

const TouchAwareTooltip = ({ children, open, defaultOpen, onOpenChange, ...props }: TouchAwareTooltipProps) => {
  const isTouchDevice = useTouchDevice()

  // Determine if controlled mode on first render and never change it
  // This prevents controlled/uncontrolled switching warnings
  const isControlledRef = React.useRef(open !== undefined)
  const isControlled = isControlledRef.current

  const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? false)
  const timeoutRef = React.useRef<NodeJS.Timeout>()

  // Use external 'open' prop if controlled, otherwise use internal state
  const isOpen = isControlled ? (open ?? false) : internalOpen

  // Keep internal state in sync with external controlled state
  React.useEffect(() => {
    if (isControlled && open !== undefined && open !== internalOpen) {
      setInternalOpen(open)
    }
  }, [isControlled, open, internalOpen])

  // Prevent controlled/uncontrolled switching during SSR/hydration
  // by ensuring we have a consistent state management approach
  const [isClient, setIsClient] = React.useState(false)

  React.useEffect(() => {
    setIsClient(true)
  }, [])

  const handleOpenChange = React.useCallback((newOpen: boolean) => {
    // Always update internal state for uncontrolled mode OR touch devices
    // Touch devices need internal state management even if externally "controlled"
    if (!isControlled || isTouchDevice) {
      setInternalOpen(newOpen)
    }

    // Call external onOpenChange if provided
    if (onOpenChange) {
      onOpenChange(newOpen)
    }
  }, [isControlled, isTouchDevice, onOpenChange])

  // Handle touch interactions
  const handleTouchStart = React.useCallback(() => {
    if (isTouchDevice) {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [isTouchDevice])

  const handleClick = React.useCallback(() => {
    if (isTouchDevice) {
      // On touch devices, toggle the tooltip on click
      // Don't prevent default to allow other click handlers to work
      handleOpenChange(!isOpen)
    }
  }, [isTouchDevice, isOpen, handleOpenChange])

  // Handle mouse interactions for non-touch devices
  const handleMouseEnter = React.useCallback(() => {
    if (!isTouchDevice) {
      handleOpenChange(true)
    }
  }, [isTouchDevice, handleOpenChange])

  const handleMouseLeave = React.useCallback(() => {
    if (!isTouchDevice) {
      handleOpenChange(false)
    }
  }, [isTouchDevice, handleOpenChange])

  // Close tooltip when clicking outside on touch devices
  React.useEffect(() => {
    if (!isTouchDevice || !isOpen) return

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      // Get the tooltip content element
      const tooltipContent = document.querySelector('[data-radix-tooltip-content]')
      const target = event.target as Node

      // Don't close if clicking on the tooltip content itself
      if (tooltipContent && tooltipContent.contains(target)) {
        return
      }

      // Close tooltip on outside click/touch
      handleOpenChange(false)
    }

    // Add a small delay to prevent immediate closing when opening
    timeoutRef.current = setTimeout(() => {
      document.addEventListener('click', handleClickOutside, true)
      document.addEventListener('touchend', handleClickOutside, true)
    }, 150)

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      document.removeEventListener('click', handleClickOutside, true)
      document.removeEventListener('touchend', handleClickOutside, true)
    }
  }, [isTouchDevice, isOpen, handleOpenChange])

  // Build props for TooltipPrimitive.Root based on controlled/uncontrolled mode
  // For touch devices, ALWAYS use controlled mode so our custom handlers work
  // For non-touch devices, respect the original controlled/uncontrolled mode
  const rootProps = (isTouchDevice || isControlled)
    ? { open: isOpen, onOpenChange: handleOpenChange, ...props }
    : { defaultOpen: defaultOpen ?? false, ...props }

  // During SSR/hydration, use simple uncontrolled mode
  if (!isClient) {
    return (
      <TooltipPrimitive.Root defaultOpen={defaultOpen ?? false} {...props}>
        {React.Children.map(children, (child) => {
          if (React.isValidElement(child) && child.type === TouchAwareTooltipTrigger) {
            return React.cloneElement(child, {})
          }
          return child
        })}
      </TooltipPrimitive.Root>
    )
  }

  // For touch devices, add touch-specific event handlers
  // Always use controlled mode on touch devices for better UX
  if (isTouchDevice) {
    return (
      <TooltipPrimitive.Root open={isOpen} onOpenChange={handleOpenChange} {...props}>
        {React.Children.map(children, (child) => {
          if (React.isValidElement(child) && child.type === TouchAwareTooltipTrigger) {
            return React.cloneElement(child, {
              onTouchStart: handleTouchStart,
              onClick: handleClick,
              // Prevent default hover behavior on touch devices
              onPointerEnter: undefined,
              onPointerLeave: undefined,
            } as React.ComponentProps<typeof TouchAwareTooltipTrigger>)
          }
          return child
        })}
      </TooltipPrimitive.Root>
    )
  }

  // For non-touch devices, use hover event handlers only if controlled
  // For uncontrolled mode, let Radix UI handle everything automatically
  return (
    <TooltipPrimitive.Root {...rootProps}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child) && child.type === TouchAwareTooltipTrigger) {
          // Only add custom handlers if in controlled mode
          const customHandlers = isControlled ? {
            onMouseEnter: handleMouseEnter,
            onMouseLeave: handleMouseLeave,
          } : {}
          return React.cloneElement(child, customHandlers as React.ComponentProps<typeof TouchAwareTooltipTrigger>)
        }
        return child
      })}
    </TooltipPrimitive.Root>
  )
}
TouchAwareTooltip.displayName = "TouchAwareTooltip"

// Enhanced TooltipTrigger component with touch support
interface TouchAwareTooltipTriggerProps extends React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger> {
  onTouchStart?: (event: React.TouchEvent) => void
  onClick?: (event: React.MouseEvent) => void
  onMouseEnter?: (event: React.MouseEvent) => void
  onMouseLeave?: (event: React.MouseEvent) => void
  onPointerEnter?: (event: React.PointerEvent) => void
  onPointerLeave?: (event: React.PointerEvent) => void
}

const TouchAwareTooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  TouchAwareTooltipTriggerProps
>(({ onTouchStart, onClick, onMouseEnter, onMouseLeave, onPointerEnter, onPointerLeave, children, asChild, ...props }, ref) => {
  // Create merged event handlers that call both our handlers and any existing child handlers
  const handleTouchStart = React.useCallback((event: React.TouchEvent) => {
    onTouchStart?.(event)
  }, [onTouchStart])

  const handleClick = React.useCallback((event: React.MouseEvent) => {
    onClick?.(event)
  }, [onClick])

  const handleMouseEnter = React.useCallback((event: React.MouseEvent) => {
    onMouseEnter?.(event)
  }, [onMouseEnter])

  const handleMouseLeave = React.useCallback((event: React.MouseEvent) => {
    onMouseLeave?.(event)
  }, [onMouseLeave])

  const handlePointerEnter = React.useCallback((event: React.PointerEvent) => {
    onPointerEnter?.(event)
  }, [onPointerEnter])

  const handlePointerLeave = React.useCallback((event: React.PointerEvent) => {
    onPointerLeave?.(event)
  }, [onPointerLeave])

  // When using asChild, we need to merge our event handlers with the child's handlers
  if (asChild && React.isValidElement(children)) {
    const childProps = children.props as Record<string, unknown> & {
      style?: React.CSSProperties
      onTouchStart?: (event: React.TouchEvent) => void
      onClick?: (event: React.MouseEvent) => void
      onMouseEnter?: (event: React.MouseEvent) => void
      onMouseLeave?: (event: React.MouseEvent) => void
      onPointerEnter?: (event: React.PointerEvent) => void
      onPointerLeave?: (event: React.PointerEvent) => void
    }
    const childStyle = childProps.style || {}

    const mergedProps = {
      ...childProps,
      // Ensure the element is interactive for touch devices
      style: {
        ...childStyle,
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
      } as React.CSSProperties,
      onTouchStart: (event: React.TouchEvent) => {
        handleTouchStart(event)
        childProps.onTouchStart?.(event)
      },
      onClick: (event: React.MouseEvent) => {
        handleClick(event)
        childProps.onClick?.(event)
      },
      onMouseEnter: (event: React.MouseEvent) => {
        handleMouseEnter(event)
        childProps.onMouseEnter?.(event)
      },
      onMouseLeave: (event: React.MouseEvent) => {
        handleMouseLeave(event)
        childProps.onMouseLeave?.(event)
      },
      onPointerEnter: onPointerEnter !== undefined ? (event: React.PointerEvent) => {
        handlePointerEnter(event)
        childProps.onPointerEnter?.(event)
      } : childProps.onPointerEnter,
      onPointerLeave: onPointerLeave !== undefined ? (event: React.PointerEvent) => {
        handlePointerLeave(event)
        childProps.onPointerLeave?.(event)
      } : childProps.onPointerLeave,
    }

    return (
      <TooltipPrimitive.Trigger ref={ref} asChild {...props}>
        {React.cloneElement(children, mergedProps)}
      </TooltipPrimitive.Trigger>
    )
  }

  // Standard rendering when not using asChild
  return (
    <TooltipPrimitive.Trigger
      ref={ref}
      onTouchStart={handleTouchStart}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      asChild={asChild}
      {...props}
    >
      {children}
    </TooltipPrimitive.Trigger>
  )
})
TouchAwareTooltipTrigger.displayName = "TouchAwareTooltipTrigger"

// Export both original components (for backward compatibility) and enhanced components
export {
  // Original Radix UI components
  TooltipProvider,
  TooltipContent,

  // Enhanced components with touch support
  TouchAwareTooltip as Tooltip,
  TouchAwareTooltipTrigger as TooltipTrigger,
}

// Also export original components with different names for advanced use cases
export { TooltipPrimitive }
export const TooltipRoot = TooltipPrimitive.Root
export const TooltipTriggerPrimitive = TooltipPrimitive.Trigger
