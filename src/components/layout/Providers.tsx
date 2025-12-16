'use client';

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { type ThemeProviderProps } from "next-themes";
import { SessionProvider } from 'next-auth/react';
import { GroupTypeProvider } from '@/context/GroupTypeContext';
import { SecureUIProvider } from '@/context/SecureUIContext';
import { SessionTrackingProvider } from '@/components/providers/SessionTrackingProvider';
import * as React from "react";

 export function Providers({ children, ...props }: ThemeProviderProps) {
   return (
     <NextThemesProvider {...props}>
       <SessionProvider>
         <SecureUIProvider>
           <GroupTypeProvider>
             <SessionTrackingProvider>
               {children}
             </SessionTrackingProvider>
           </GroupTypeProvider>
         </SecureUIProvider>
       </SessionProvider>
     </NextThemesProvider>
   );
 }