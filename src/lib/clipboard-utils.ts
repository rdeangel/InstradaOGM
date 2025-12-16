'use client';

/**
 * Utility functions for clipboard operations with enhanced error handling
 * Provides better error messages when clipboard operations fail, especially over HTTP
 */

/**
 * Checks if the application is running over HTTP (not HTTPS)
 * @returns true if running over HTTP, false if HTTPS
 */
export function isRunningOverHttp(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.protocol === 'http:';
}

/**
 * Gets an enhanced error message for clipboard failures
 * Note: With the fallback method, clipboard should work on HTTP too
 * @returns Enhanced error message
 */
export function getClipboardErrorMessage(): string {
  return "Could not copy to clipboard. Please try copying manually.";
}

/**
 * Gets an enhanced error description for clipboard failures
 * Note: With the fallback method, clipboard should work on HTTP too
 * @returns Enhanced error description
 */
export function getClipboardErrorDescription(): string {
  return "Clipboard operation failed. Please select and copy the text manually.";
}

/**
 * Fallback method using execCommand for HTTP compatibility
 * Enhanced with better browser and mobile support
 * @param text - The text to copy
 * @returns boolean indicating success
 */
function fallbackCopyToClipboard(text: string): boolean {
  // Create a temporary textarea element
  const textArea = document.createElement('textarea');
  textArea.value = text;

  // Prevent scrolling when focusing
  textArea.style.position = 'fixed';
  textArea.style.top = '0';
  textArea.style.left = '0';
  textArea.style.width = '2em';
  textArea.style.height = '2em';
  textArea.style.padding = '0';
  textArea.style.border = 'none';
  textArea.style.outline = 'none';
  textArea.style.boxShadow = 'none';
  textArea.style.background = 'transparent';

  // Make readonly to prevent keyboard on iOS
  textArea.setAttribute('readonly', '');
  textArea.contentEditable = 'true';
  textArea.readOnly = false;

  document.body.appendChild(textArea);

  try {
    // Store old selection
    const oldSelection = document.getSelection();
    const oldRange = oldSelection && oldSelection.rangeCount > 0 ? oldSelection.getRangeAt(0) : null;

    // Select all text in textarea
    textArea.focus();
    textArea.select();

    // For iOS and some mobile browsers
    textArea.setSelectionRange(0, textArea.value.length);

    // Try to copy using the old execCommand method
    const successful = document.execCommand('copy');

    // Restore old selection
    if (oldRange && oldSelection) {
      oldSelection.removeAllRanges();
      oldSelection.addRange(oldRange);
    }

    // Clean up
    document.body.removeChild(textArea);

    return successful;
  } catch (err) {
    console.error('Fallback copy failed:', err);
    try {
      document.body.removeChild(textArea);
    } catch {
      // Element might already be removed
    }
    return false;
  }
}

/**
 * Safely copies text to clipboard with enhanced error handling and HTTP fallback
 * Works on both HTTPS (using modern Clipboard API) and HTTP (using execCommand fallback)
 * @param text - The text to copy
 * @returns Promise that resolves to true if successful, false if failed
 */
export async function safeClipboardCopy(text: string): Promise<boolean> {
  // Debug logging
  console.log('[Clipboard] Attempting to copy text of length:', text?.length || 0);

  // Try modern Clipboard API first (works on HTTPS and localhost)
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      console.log('[Clipboard] Modern API succeeded');
      return true;
    } catch (error) {
      console.warn('[Clipboard] Modern clipboard API failed, trying fallback method:', error);
      // Fall through to fallback method
    }
  } else {
    console.log('[Clipboard] Modern API not available, using fallback');
  }

  // Use fallback method for HTTP or if modern API failed
  const result = fallbackCopyToClipboard(text);
  console.log('[Clipboard] Fallback method result:', result);
  return result;
}

