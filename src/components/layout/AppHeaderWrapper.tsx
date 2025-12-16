import { AppHeaderClient } from './AppHeader';

interface AppHeaderWrapperProps {
  showScrollButton?: boolean;
  onScrollButtonClick?: () => void;
  layoutMode?: 'stacked' | 'side-by-side';
  setLayoutMode?: (mode: 'stacked' | 'side-by-side') => void;
}

/**
 * Server component wrapper for AppHeader
 * Note: With the new UIConfigContext, this wrapper is no longer needed
 * but kept for backward compatibility
 */
export async function AppHeaderWrapper(props: AppHeaderWrapperProps) {
  return (
    <AppHeaderClient
      {...props}
    />
  );
}
