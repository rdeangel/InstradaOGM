'use client';

import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface CardSkeletonProps {
  className?: string;
  title?: boolean;
  description?: boolean;
  content?: boolean;
  footer?: boolean;
  children?: React.ReactNode;
}

export function CardSkeleton({
  className,
  title = true,
  description = true,
  content = true,
  footer = false,
  children,
}: CardSkeletonProps) {
  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-3">
        {title && (
          <div className="flex items-center space-x-2">
            <Skeleton className="h-6 w-6 rounded-full" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        )}
        {description && (
          <div className="mt-2">
            <Skeleton className="h-4 w-full" />
          </div>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        {content && (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        )}
        {children}
      </CardContent>
      {footer && (
        <div className="px-6 pb-6">
          <Skeleton className="h-4 w-full" />
        </div>
      )}
    </Card>
  );
}