'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable security/detect-object-injection */
// This component uses bracket notation extensively with chart data keys. All uses are safe.

import React from 'react';
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface DataPoint {
  [key: string]: any;
}

interface BarChartProps {
  data: DataPoint[];
  title?: string;
  description?: string;
  xAxisKey: string;
  bars: {
    key: string;
    name: string;
    color: string;
  }[];
  height?: number;
  showGrid?: boolean;
  showLegend?: boolean;
  orientation?: 'horizontal' | 'vertical';
  formatTooltip?: (value: any, name: string, payload?: any) => [string, string];
  formatXAxis?: (value: any) => string;
  formatYAxis?: (value: any) => string;
}

// Custom component to render Y-axis labels with tooltips
const YAxisLabelWithTooltip = ({ x, y, payload, data }: any) => {
  if (!payload?.value) return null;

  const displayValue = String(payload.value);
  const dataItem = data?.find((item: any) => String(item.name) === displayValue);
  const fullEndpoint = dataItem?.fullEndpoint;
  const isNameTruncated = fullEndpoint && fullEndpoint !== displayValue;

  if (!isNameTruncated) {
    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={0}
          y={0}
          dy={4}
          textAnchor="end"
          fill="currentColor"
          className="text-xs"
          style={{ fontSize: '12px' }}
        >
          {displayValue}
        </text>
      </g>
    );
  }

  // For truncated names, we'll use a title attribute for basic tooltip
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={4}
        textAnchor="end"
        fill="currentColor"
        className="text-xs cursor-help"
        style={{ fontSize: '12px' }}
      >
        <title>{fullEndpoint}</title>
        {displayValue}
      </text>
    </g>
  );
};



export function BarChart({
  data,
  title,
  description,
  xAxisKey,
  bars,
  height = 300,
  showGrid = true,
  showLegend = true,
  orientation = 'vertical',
  formatTooltip,
  formatXAxis,
  formatYAxis,
}: BarChartProps) {

  // Check if any data items have truncated names (indicating need for tooltips)
  const hasTruncatedNames = data?.some(item => {
    const displayName = String(item[xAxisKey] || '');
    const fullName = item.fullEndpoint || displayName;
    return fullName !== displayName;
  });

  // For problematic charts or charts with truncated names, use simple HTML fallback immediately
  if (title?.includes('Top Users') || title?.includes('Top API Keys') || title?.includes('Top Endpoints') || title?.includes('Endpoints by Request Count') || hasTruncatedNames) {

    if (!data || data.length === 0) {
      return (
        <Card>
          {(title || description) && (
            <CardHeader>
              {title && <CardTitle className="text-lg">{title}</CardTitle>}
              {description && <CardDescription>{description}</CardDescription>}
            </CardHeader>
          )}
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

    // Create safe data for HTML fallback
    const safeData = data.slice(0, 10).map((item, index) => {
      const safeItem: any = {};
      safeItem[xAxisKey] = String(item[xAxisKey] || `Item ${index}`);
      bars.forEach(bar => {
        const value = item[bar.key];
        safeItem[bar.key] = Number.isFinite(Number(value)) ? Number(value) : 0;
      });
      return safeItem;
    });

    const maxValue = Math.max(...safeData.map(item =>
      Math.max(...bars.map(bar => item[bar.key] || 0))
    ));

    return (
      <Card>
        {(title || description) && (
          <CardHeader>
            {title && <CardTitle className="text-lg">{title}</CardTitle>}
            {description && <CardDescription>{description}</CardDescription>}
          </CardHeader>
        )}
        <CardContent>
          <div style={{ height, padding: '20px' }}>
            <TooltipProvider>
              <div className="space-y-3">
                {safeData.map((item, index) => {
                  const displayName = String(item[xAxisKey]);
                  const fullName = item.fullEndpoint || displayName;
                  const isNameTruncated = fullName !== displayName;

                  return (
                    <div key={index} className="flex items-center gap-3">
                      <div className="w-32 text-sm font-medium">
                        {isNameTruncated ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="truncate cursor-help">
                                {displayName}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs break-all">{fullName}</p>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <div className="truncate">
                            {displayName}
                          </div>
                        )}
                      </div>
                  {bars.map(bar => {
                    const value = item[bar.key] || 0;
                    const width = maxValue > 0 ? Math.max((value / maxValue) * 100, 2) : 2;
                    return (
                      <div key={bar.key} className="flex-1 flex items-center gap-2">
                        <div
                          className="h-6 rounded flex items-center justify-end pr-2 text-white text-xs font-medium"
                          style={{
                            backgroundColor: bar.color,
                            width: `${width}%`,
                            minWidth: '40px'
                          }}
                        >
                          {value > 0 ? value.toLocaleString() : ''}
                        </div>
                      </div>
                    );
                  })}
                    </div>
                  );
                })}
              </div>
            <div className="mt-4 flex gap-4 text-xs">
              {bars.map(bar => (
                <div key={bar.key} className="flex items-center gap-1">
                  <div
                    className="w-3 h-3 rounded"
                    style={{ backgroundColor: bar.color }}
                  />
                  <span>{bar.name}</span>
                </div>
              ))}
            </div>
            </TooltipProvider>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Handle empty data
  if (!data || data.length === 0) {
    return (
      <Card>
        {(title || description) && (
          <CardHeader>
            {title && <CardTitle className="text-lg">{title}</CardTitle>}
            {description && <CardDescription>{description}</CardDescription>}
          </CardHeader>
        )}
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

  // Sanitize data to handle NaN, null, undefined values
  const sanitizedData = data.map((item, index) => {
    const newItem = { ...item };
    bars.forEach(bar => {
      const value = newItem[bar.key];
      // Convert NaN, null, undefined to 0
      if (value === null || value === undefined || Number.isNaN(Number(value))) {
        newItem[bar.key] = 0;
      } else {
        // Ensure it's a valid number
        const numValue = Number(value);
        if (Number.isNaN(numValue) || !Number.isFinite(numValue)) {
          newItem[bar.key] = 0;
        } else {
          newItem[bar.key] = numValue;
        }
      }
    });

    // Also sanitize the xAxisKey value
    if (typeof newItem[xAxisKey] === 'undefined' || newItem[xAxisKey] === null) {
      newItem[xAxisKey] = `Item ${index}`;
    }

    return newItem;
  });

  // Final validation before passing to Recharts
  const finalData = sanitizedData.map((item, index) => {
    const validatedItem = { ...item };
    // Ensure all values are safe for Recharts
    Object.keys(validatedItem).forEach(key => {
      const value = validatedItem[key];

      // Handle all possible problematic values
      if (value === null || value === undefined) {
        validatedItem[key] = key === xAxisKey ? `Item ${index}` : 0;
      } else if (typeof value === 'number') {
        if (!Number.isFinite(value) || Number.isNaN(value)) {
          validatedItem[key] = 0;
        }
      } else if (typeof value === 'string') {
        // For string values, ensure they're not empty or problematic
        if (value.trim() === '' || value === 'NaN' || value === 'undefined' || value === 'null') {
          validatedItem[key] = key === xAxisKey ? `Item ${index}` : '0';
        }
      } else {
        // For any other type, convert appropriately
        if (key === xAxisKey) {
          validatedItem[key] = String(value) || `Item ${index}`;
        } else {
          validatedItem[key] = 0;
        }
      }
    });

    // Extra safety: ensure xAxisKey exists and is valid
    if (!validatedItem[xAxisKey] || validatedItem[xAxisKey] === '') {
      validatedItem[xAxisKey] = `Item ${index}`;
    }

    return validatedItem;
  });

  // Filter out bars that have all zero values
  const activeBars = bars.filter(bar => {
    return finalData.some(item => item[bar.key] > 0);
  });

  // If no bars have data, show empty state
  if (activeBars.length === 0) {
    return (
      <Card>
        {(title || description) && (
          <CardHeader>
            {title && <CardTitle className="text-lg">{title}</CardTitle>}
            {description && <CardDescription>{description}</CardDescription>}
          </CardHeader>
        )}
        <CardContent>
          <div className="flex items-center justify-center" style={{ height }}>
            <div className="text-center text-gray-500">
              <p className="text-sm">No data to display</p>
              <p className="text-xs text-muted-foreground mt-1">
                {finalData.length === 0 ? 'No data available' : 'All values are zero or empty'}
              </p>
              {process.env.NODE_ENV === 'development' && (
                <p className="text-xs text-muted-foreground mt-1">
                  Debug: {finalData.length} data points, {bars.length} bars configured
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      {(title || description) && (
        <CardHeader>
          {title && <CardTitle className="text-lg">{title}</CardTitle>}
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
      )}
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          {(() => {
            try {
              // Final aggressive sanitization before Recharts
              const ultraSafeFinalData = finalData.map((item, idx) => {
                const safeItem: any = {};
                Object.entries(item).forEach(([key, value]) => {
                  if (key === xAxisKey) {
                    // Ensure xAxis key is always a string
                    safeItem[key] = value != null ? String(value) : `Item ${idx}`;
                  } else if (typeof value === 'number') {
                    // Ultra-safe number handling
                    if (Number.isNaN(value) || !Number.isFinite(value) || value === null || value === undefined) {
                      safeItem[key] = 0;
                    } else {
                      safeItem[key] = value;
                    }
                  } else {
                    // For any other type, ensure it's safe
                    safeItem[key] = value != null ? value : (key === xAxisKey ? `Item ${idx}` : 0);
                  }
                });
                return safeItem;
              });

              try {
                return (
                  <RechartsBarChart
                    data={ultraSafeFinalData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                    layout={orientation === 'horizontal' ? 'horizontal' : 'vertical'}
                    barCategoryGap="20%"
                    barGap={4}
                  >
            {showGrid && <CartesianGrid strokeDasharray="3 3" className="opacity-30" />}
            <XAxis
              dataKey={orientation === 'horizontal' ? undefined : xAxisKey}
              type={orientation === 'horizontal' ? 'number' : 'category'}
              tickFormatter={formatXAxis}
              className="text-xs"
            />
            <YAxis
              dataKey={orientation === 'horizontal' ? xAxisKey : undefined}
              type={orientation === 'horizontal' ? 'category' : 'number'}
              tickFormatter={formatYAxis}
              className="text-xs"
              domain={orientation === 'vertical' ? [0, 'dataMax'] : undefined}
              allowDataOverflow={false}
              width={150}
              tick={orientation === 'horizontal' ? (props: any) => <YAxisLabelWithTooltip {...props} data={ultraSafeFinalData} /> : undefined}
            />
            <RechartsTooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || payload.length === 0) return null;

                // Get the full endpoint name if available
                const fullEndpoint = payload[0]?.payload?.fullEndpoint;
                const displayLabel = fullEndpoint || label;

                return (
                  <div
                    style={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                      color: 'hsl(var(--popover-foreground))',
                      fontSize: '14px',
                      boxShadow: 'hsl(var(--shadow)) 0px 4px 6px -1px, hsl(var(--shadow)) 0px 2px 4px -1px',
                      padding: '8px 12px',
                      zIndex: 1000,
                    }}
                  >
                    <div style={{
                      color: 'hsl(var(--popover-foreground))',
                      fontSize: '14px',
                      fontWeight: '500',
                      marginBottom: '4px',
                      wordBreak: 'break-all'
                    }}>
                      {displayLabel}
                    </div>
                    {payload.map((entry, index) => (
                      <div key={index} style={{ color: 'hsl(var(--popover-foreground))' }}>
                        <span style={{ color: entry.color }}>●</span>{' '}
                        {entry.name}: {formatTooltip ? formatTooltip(entry.value, String(entry.name), entry.payload)[0] : Number(entry.value).toLocaleString()}
                      </div>
                    ))}
                  </div>
                );
              }}
            />
            {showLegend && <Legend />}
            {activeBars.map((bar) => (
              <Bar
                key={bar.key}
                dataKey={bar.key}
                fill={bar.color}
                name={bar.name}
                radius={[2, 2, 0, 0]}
                maxBarSize={60}
              />
                ))}
                  </RechartsBarChart>
                );
              } catch {

                // Return a simple fallback for Recharts-specific errors
                return (
                  <div className="flex items-center justify-center" style={{ height }}>
                    <div className="text-center text-gray-500">
                      <p className="text-sm">Chart temporarily unavailable</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {process.env.NODE_ENV === 'development' ? 'Recharts rendering error' : 'Please try refreshing'}
                      </p>
                    </div>
                  </div>
                );
              }
            } catch (error) {

              // Fallback to simple HTML bars for critical charts
              if (title?.includes('Top Users') && finalData.length > 0) {
                const maxValue = Math.max(...finalData.map(item =>
                  Math.max(...bars.map(bar => Number(item[bar.key]) || 0))
                ));

                return (
                  <div style={{ height, padding: '20px' }}>
                    <div className="text-sm font-medium mb-4">
                      {title} (Fallback View)
                    </div>
                    <TooltipProvider>
                      <div className="space-y-2">
                        {finalData.slice(0, 5).map((item, index) => {
                          const displayName = String(item[xAxisKey] || `Item ${index}`);
                          const fullName = item.fullEndpoint || displayName;
                          const isNameTruncated = fullName !== displayName;

                          return (
                            <div key={index} className="flex items-center gap-2">
                              <div className="w-24 text-xs">
                                {isNameTruncated ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="truncate cursor-help">
                                        {displayName}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="max-w-xs break-all">{fullName}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <div className="truncate">
                                    {displayName}
                                  </div>
                                )}
                              </div>
                          {bars.map(bar => {
                            const value = Number(item[bar.key]) || 0;
                            const width = maxValue > 0 ? (value / maxValue) * 100 : 0;
                            return (
                              <div key={bar.key} className="flex-1 flex items-center gap-1">
                                <div
                                  className="h-4 rounded"
                                  style={{
                                    backgroundColor: bar.color,
                                    width: `${Math.max(width, 2)}%`,
                                    minWidth: value > 0 ? '2px' : '0px'
                                  }}
                                />
                                <span className="text-xs text-gray-600 w-8">
                                  {value.toLocaleString()}
                                </span>
                              </div>
                            );
                          })}
                            </div>
                          );
                        })}
                      </div>
                    </TooltipProvider>
                  </div>
                );
              }

              return (
                <div className="flex items-center justify-center" style={{ height }}>
                  <div className="text-center text-gray-500">
                    <p className="text-sm">Chart rendering error</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : 'Please try refreshing'}
                    </p>
                  </div>
                </div>
              );
            }
          })()}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
