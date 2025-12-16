// src/components/layout/AppFooter.tsx
import React, { forwardRef } from 'react';

interface AppFooterProps {
  pageTitle: string;
}

export const AppFooter = forwardRef<HTMLDivElement, AppFooterProps>(({ pageTitle }, ref) => (
  <footer ref={ref} className="bg-card border-t border-border shadow-sm fixed bottom-0 w-full z-10">
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 text-center text-sm text-muted-foreground">
      InstradaOGM - {pageTitle}
    </div>
  </footer>
));

AppFooter.displayName = 'AppFooter';