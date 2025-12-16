'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface EndpointData {
  name: string;
  fullEndpoint: string;
  requests: number;
  percentage: number;
}

interface EndpointsBarChartProps {
  data: EndpointData[];
  title?: string;
  description?: string;
  height?: number;
}

export function EndpointsBarChart({ 
  data, 
  title = "Top Endpoints by Request Count", 
  description = "Most frequently accessed API endpoints",
  height = 400 
}: EndpointsBarChartProps) {
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center" style={{ height }}>
            <div className="text-center text-gray-500">
              <p className="text-sm">No data available</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const maxValue = Math.max(...data.map(item => item.requests));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div style={{ height, padding: '20px' }}>
          <TooltipProvider>
            <div className="space-y-3">
              {data.map((item, index) => {
                const width = maxValue > 0 ? Math.max((item.requests / maxValue) * 100, 2) : 2;
                
                return (
                  <div key={index} className="flex items-center gap-3">
                    <div className="w-40 text-sm font-medium">
                      {/* Always show tooltip since visual truncation can happen even without "..." */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="truncate cursor-help text-left">
                            {item.name}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-sm">
                          <p className="break-all">{item.fullEndpoint}</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="flex-1 flex items-center gap-2">
                      <div
                        className="h-6 rounded flex items-center justify-end pr-2 text-white text-xs font-medium"
                        style={{
                          backgroundColor: '#f59e0b',
                          width: `${width}%`,
                          minWidth: '40px'
                        }}
                      >
                        {item.requests > 0 ? item.requests.toLocaleString() : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex gap-4 text-xs">
              <div className="flex items-center gap-1">
                <div
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: '#f59e0b' }}
                />
                <span>Request Count</span>
              </div>
            </div>
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>
  );
}
