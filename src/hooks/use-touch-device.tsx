import * as React from "react"

/**
 * Hook to detect if the current device supports touch interactions.
 * This is useful for determining whether to show tooltips on hover (desktop)
 * or on tap/click (mobile/tablet devices).
 * 
 * The hook handles:
 * - Touch capability detection
 * - Server-side rendering (SSR) compatibility
 * - Hybrid devices that support both touch and mouse
 * 
 * @returns boolean indicating if the device supports touch interactions
 */
export function useTouchDevice() {
  const [isTouchDevice, setIsTouchDevice] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    // Check for touch support using multiple methods for better compatibility
    const hasTouchSupport = () => {
      // Primary check: ontouchstart event support
      if ('ontouchstart' in window) return true
      
      // Secondary check: TouchEvent constructor
      if (typeof window !== 'undefined' && window.TouchEvent) return true
      
      // Tertiary check: navigator.maxTouchPoints (modern browsers)
      if (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) return true
      
      // Quaternary check: CSS media query support
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true
      
      return false
    }

    const updateTouchSupport = () => {
      setIsTouchDevice(hasTouchSupport())
    }

    // Set initial value
    updateTouchSupport()

    // Listen for changes in touch capability (for hybrid devices)
    // This handles cases where a device might switch between touch and mouse modes
    const mediaQuery = window.matchMedia('(pointer: coarse)')
    const handleMediaChange = () => {
      updateTouchSupport()
    }

    // Add event listener for media query changes
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleMediaChange)
    } else {
      // Fallback for older browsers
      mediaQuery.addListener(handleMediaChange)
    }

    // Cleanup
    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleMediaChange)
      } else {
        // Fallback for older browsers
        mediaQuery.removeListener(handleMediaChange)
      }
    }
  }, [])

  // Return false during SSR to avoid hydration mismatches
  // This ensures tooltips work with hover by default until client-side detection completes
  return !!isTouchDevice
}

/**
 * Hook to detect if the device has both touch and mouse capabilities.
 * This is useful for hybrid devices like laptops with touchscreens.
 * 
 * @returns boolean indicating if the device supports both touch and precise pointer
 */
export function useHybridDevice() {
  const [isHybridDevice, setIsHybridDevice] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const checkHybridSupport = (): boolean => {
      // Check if device has both touch and precise pointer capabilities
      const hasTouch = 'ontouchstart' in window ||
                      Boolean(navigator.maxTouchPoints && navigator.maxTouchPoints > 0)

      const hasPrecisePointer = Boolean(window.matchMedia &&
                               window.matchMedia('(pointer: fine)').matches)

      return hasTouch && hasPrecisePointer
    }

    setIsHybridDevice(checkHybridSupport())

    // Listen for changes in pointer capabilities
    const finePointerQuery = window.matchMedia('(pointer: fine)')
    const coarsePointerQuery = window.matchMedia('(pointer: coarse)')
    
    const handleChange = () => {
      setIsHybridDevice(checkHybridSupport())
    }

    // Add listeners
    if (finePointerQuery.addEventListener) {
      finePointerQuery.addEventListener('change', handleChange)
      coarsePointerQuery.addEventListener('change', handleChange)
    } else {
      finePointerQuery.addListener(handleChange)
      coarsePointerQuery.addListener(handleChange)
    }

    // Cleanup
    return () => {
      if (finePointerQuery.removeEventListener) {
        finePointerQuery.removeEventListener('change', handleChange)
        coarsePointerQuery.removeEventListener('change', handleChange)
      } else {
        finePointerQuery.removeListener(handleChange)
        coarsePointerQuery.removeListener(handleChange)
      }
    }
  }, [])

  return !!isHybridDevice
}
