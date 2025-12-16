'use client';

import { useMemo } from 'react';
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
    TooltipProps,
} from 'recharts';
import { format, subDays, subHours, subMonths, subWeeks, subYears, isAfter } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLocalStorage } from '@/hooks/use-local-storage';

interface MacIpHistoryEntry {
    id: string;
    ipAddress?: string;
    ipAddresses?: string[];
    firstSeen: Date;
    lastSeen: Date;
    isActive?: boolean;
    hostname?: string | null;
    hostAlias?: string | null;
    hostnames?: Array<{ ipAddress: string; hostname: string }>;
    hostAliases?: Array<{ ipAddress: string; alias: string }>;
}

interface MacHistoryGraphProps {
    history: MacIpHistoryEntry[];
    className?: string;
}

type TimePeriod = '1h' | '3h' | '6h' | '12h' | '1d' | '1w' | '1m' | '3m' | '1y';

interface GraphDataPoint {
    time: number;
    value: number;
    ips: string;
    hostname?: string | null;
    hostAlias?: string | null;
    status: 'Active' | 'Inactive';
    originalEntry?: MacIpHistoryEntry;
}

export function MacHistoryGraph({ history, className }: MacHistoryGraphProps) {
    const [timePeriod, setTimePeriod] = useLocalStorage<TimePeriod>('mac-history-graph-time-period', '1w');

    const chartData = useMemo(() => {
        if (!history || history.length === 0) return [];

        // Determine cutoff date based on selected time period
        const now = new Date();
        let cutoffDate: Date;

        switch (timePeriod) {
            case '1h':
                cutoffDate = subHours(now, 1);
                break;
            case '3h':
                cutoffDate = subHours(now, 3);
                break;
            case '6h':
                cutoffDate = subHours(now, 6);
                break;
            case '12h':
                cutoffDate = subHours(now, 12);
                break;
            case '1d':
                cutoffDate = subDays(now, 1);
                break;
            case '1w':
                cutoffDate = subWeeks(now, 1);
                break;
            case '1m':
                cutoffDate = subMonths(now, 1);
                break;
            case '3m':
                cutoffDate = subMonths(now, 3);
                break;
            case '1y':
                cutoffDate = subYears(now, 1);
                break;
            default:
                cutoffDate = subWeeks(now, 1);
        }

        // Filter history based on cutoff date
        // Include entries that overlap with the period (end time is after cutoff)
        const filteredHistory = history.filter(entry =>
            isAfter(new Date(entry.lastSeen), cutoffDate)
        );

        // Sort history by time ascending
        const sortedHistory = [...filteredHistory].sort((a, b) =>
            new Date(a.firstSeen).getTime() - new Date(b.firstSeen).getTime()
        );

        const dataPoints: GraphDataPoint[] = [];

        sortedHistory.forEach((entry) => {
            // Skip entries with no IPs (inactive periods)
            const entryIps = entry.ipAddresses || (entry.ipAddress ? [entry.ipAddress] : []);
            if (entryIps.length === 0) return;

            const startTime = new Date(entry.firstSeen).getTime();
            const endTime = new Date(entry.lastSeen).getTime();

            // Clamp start time to cutoff if it's before
            const effectiveStartTime = Math.max(startTime, cutoffDate.getTime());

            // Get IP(s) for display
            const ips = entry.ipAddresses || (entry.ipAddress ? [entry.ipAddress] : []);
            const ipLabel = ips.join(', ');

            // Get Hostname(s)
            let hostnameLabel = entry.hostname;
            if (!hostnameLabel && entry.hostnames && entry.hostnames.length > 0) {
                hostnameLabel = entry.hostnames.map(h => h.hostname).join(', ');
            }

            // Get Host Alias(es)
            let hostAliasLabel = entry.hostAlias;
            if (!hostAliasLabel && entry.hostAliases && entry.hostAliases.length > 0) {
                hostAliasLabel = entry.hostAliases.map(h => h.alias).join(', ');
            }

            // Start of active period
            dataPoints.push({
                time: effectiveStartTime,
                value: 1,
                ips: ipLabel,
                hostname: hostnameLabel,
                hostAlias: hostAliasLabel,
                status: 'Active',
                originalEntry: entry
            });

            // End of active period
            dataPoints.push({
                time: endTime,
                value: 1,
                ips: ipLabel,
                hostname: hostnameLabel,
                hostAlias: hostAliasLabel,
                status: 'Active',
                originalEntry: entry
            });

            // Add a null point slightly after to create a gap
            dataPoints.push({
                time: endTime + 1,
                value: 0,
                ips: '',
                hostname: null,
                hostAlias: null,
                status: 'Inactive'
            });
        });

        // Add start and end points for the chart domain if needed
        // This ensures the chart always shows the full selected period
        if (dataPoints.length > 0) {
            // Ensure we cover the start of the period
            if (dataPoints[0].time > cutoffDate.getTime()) {
                dataPoints.unshift({
                    time: cutoffDate.getTime(),
                    value: 0,
                    ips: '',
                    status: 'Inactive'
                });
            }
            // Ensure we cover up to now
            if (dataPoints[dataPoints.length - 1].time < now.getTime()) {
                dataPoints.push({
                    time: now.getTime(),
                    value: 0,
                    ips: '',
                    status: 'Inactive'
                });
            }
        }

        return dataPoints.sort((a, b) => a.time - b.time);
    }, [history, timePeriod]);

    if (!history || history.length === 0) {
        return null;
    }

    const CustomTooltip = ({ active, payload }: TooltipProps<number, string>) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload as GraphDataPoint;
            if (data.value === 0) return null;

            return (
                <div className="bg-background border rounded-md p-3 shadow-md text-sm z-50 max-w-[300px]">
                    <p className="font-medium mb-1">{format(new Date(data.time), 'PPpp')}</p>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-muted-foreground">Status:</span>
                        <Badge variant="default" className="bg-green-600 hover:bg-green-700 h-5">Active</Badge>
                    </div>

                    {data.hostAlias && (
                        <div className="mb-1">
                            <span className="text-muted-foreground text-xs uppercase tracking-wider">Alias:</span>
                            <p className="font-medium text-sm">{data.hostAlias}</p>
                        </div>
                    )}

                    {data.hostname && (
                        <div className="mb-1">
                            <span className="text-muted-foreground text-xs uppercase tracking-wider">Hostname:</span>
                            <p className="font-mono text-xs break-all">{data.hostname}</p>
                        </div>
                    )}

                    {data.ips && (
                        <div className="mt-1">
                            <span className="text-muted-foreground text-xs uppercase tracking-wider">IP(s):</span>
                            <p className="font-mono text-xs mt-0.5">{data.ips}</p>
                        </div>
                    )}
                </div>
            );
        }
        return null;
    };

    return (
        <Card className={className}>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Activity Timeline</CardTitle>
                <Select value={timePeriod} onValueChange={(v) => setTimePeriod(v as TimePeriod)}>
                    <SelectTrigger className="w-[100px] h-8">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="1h">1 hour</SelectItem>
                        <SelectItem value="3h">3 hours</SelectItem>
                        <SelectItem value="6h">6 hours</SelectItem>
                        <SelectItem value="12h">12 hours</SelectItem>
                        <SelectItem value="1d">24 hours</SelectItem>
                        <SelectItem value="1w">1 week</SelectItem>
                        <SelectItem value="1m">1 month</SelectItem>
                        <SelectItem value="3m">3 months</SelectItem>
                        <SelectItem value="1y">1 year</SelectItem>
                    </SelectContent>
                </Select>
            </CardHeader>
            <CardContent>
                <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                            data={chartData}
                            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                        >
                            <defs>
                                <linearGradient id="colorActivity" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                            <XAxis
                                dataKey="time"
                                type="number"
                                domain={['dataMin', 'dataMax']}
                                tickFormatter={(unixTime) => {
                                    const date = new Date(unixTime);
                                    if (timePeriod === '1h' || timePeriod === '3h' || timePeriod === '6h' || timePeriod === '12h' || timePeriod === '1d') return format(date, 'HH:mm');
                                    if (timePeriod === '1w') return format(date, 'MM/dd');
                                    if (timePeriod === '1y') return format(date, 'MM/yy');
                                    return format(date, 'MM/dd');
                                }}
                                stroke="hsl(var(--muted-foreground))"
                                fontSize={12}
                                tickMargin={10}
                                minTickGap={50}
                            />
                            <YAxis
                                hide
                                domain={[0, 1.2]}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Area
                                type="stepAfter"
                                dataKey="value"
                                stroke="#16a34a"
                                fillOpacity={1}
                                fill="url(#colorActivity)"
                                connectNulls={false}
                                activeDot={{ r: 4, strokeWidth: 0 }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}
