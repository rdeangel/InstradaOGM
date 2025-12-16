"use client"; // This is a client component

import { useSession } from 'next-auth/react'; // Import useSession
import { useRouter } from 'next/navigation'; // Import useRouter
import { useEffect, useState } from 'react'; // Import useEffect and useState
import { AppHeader } from '@/components/layout/AppHeader';
import { AppFooter } from '@/components/layout/AppFooter';
import { Role } from '@/types/opnsense';
import { AuditLogsClient } from '@/components/admin/AuditLogsClient'; // Import the client component
import ApiKeyUsageDashboard from '@/components/admin/ApiKeyUsageDashboard'; // Import API Key Usage Dashboard
import SessionAnalyticsDashboard from '@/components/admin/SessionAnalyticsDashboard'; // Import Session Analytics Dashboard
import CombinedAnalyticsDashboard from '@/components/admin/CombinedAnalyticsDashboard'; // Import Combined Analytics Dashboard
import AuditLogAnalyticsDashboard from '@/components/admin/AuditLogAnalyticsDashboard'; // Import Audit Log Analytics Dashboard
import { PerformanceAnalyticsDashboard } from '@/components/analytics/PerformanceAnalyticsDashboard'; // Import Performance Analytics Dashboard
import { RealTimeMonitor } from '@/components/analytics/RealTimeMonitor'; // Import Real-time Monitor
import { AuditManagementTab } from '@/components/admin/settings/AuditLogManagementTab'; // Import Audit Management Tab
import { ClientOnly } from '@/components/util/ClientOnly'; // Import ClientOnly
import { LogIn, Ban, Shield, BarChart3, ChevronDown, ChevronUp, Settings, Users, Activity, FileText } from 'lucide-react'; // Import icons
import { Button } from '@/components/ui/button'; // Import Button
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { logger } from '@/lib/logger';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLocalStorage } from '@/hooks/use-local-storage';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';


export default function AuditLogsPage() {
    const { data: session, status: authStatus } = useSession(); // Use useSession
    const router = useRouter(); // Use useRouter
    const isMobile = useIsMobile();

    // State for tab management
    const [activeTab, setActiveTab] = useLocalStorage<string>('monitoring-analytics-active-tab', 'audit-logs');
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [advancedAnalyticsEnabled, setAdvancedAnalyticsEnabled] = useState<boolean>(false);
    const [isLoadingAnalytics, setIsLoadingAnalytics] = useState<boolean>(true);

    // Check if advanced analytics is enabled
    useEffect(() => {
        const checkAnalyticsEnabled = async () => {
            try {
                const response = await fetch('/api/settings/analytics-enabled');
                if (response.ok) {
                    const data = await response.json();
                    setAdvancedAnalyticsEnabled(data.enableAdvancedAnalytics || false);
                } else {
                    setAdvancedAnalyticsEnabled(false);
                }
            } catch (error) {
                logger.error('Failed to check analytics setting:', error);
                setAdvancedAnalyticsEnabled(false);
            } finally {
                setIsLoadingAnalytics(false);
            }
        };

        checkAnalyticsEnabled();

        // Listen for advanced analytics setting changes
        const handleAdvancedAnalyticsChange = () => {
            checkAnalyticsEnabled();
        };

        window.addEventListener('advancedAnalyticsSettingsChanged', handleAdvancedAnalyticsChange);

        return () => {
            window.removeEventListener('advancedAnalyticsSettingsChanged', handleAdvancedAnalyticsChange);
        };
    }, []);

    // Handle URL parameters for tab selection and redirect from advanced tabs when disabled
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const urlParams = new URLSearchParams(window.location.search);
            const tabParam = urlParams.get('tab');
            if (tabParam === 'api-key-usage') {
                setActiveTab('api-key-usage');
            }
        }
    }, [setActiveTab]);

    // Redirect from advanced analytics tabs when they're disabled
    useEffect(() => {
        if (!isLoadingAnalytics && !advancedAnalyticsEnabled) {
            const advancedTabs = ['session-analytics', 'combined-analytics', 'performance-analytics', 'realtime-monitor'];
            if (advancedTabs.includes(activeTab)) {
                setActiveTab('audit-logs'); // Redirect to basic tab
            }
        }
    }, [advancedAnalyticsEnabled, isLoadingAnalytics, activeTab, setActiveTab]);

    // useEffect hook at the top level with conditional logic for unauthenticated users
    useEffect(() => {
        // Check if the user is unauthenticated
        if (authStatus === 'unauthenticated') {
            const timer = setTimeout(() => {
                router.push('/auth/signin'); // Redirect to the login page
            }, 10000); // 10 seconds

            // Cleanup the timer on component unmount
            return () => clearTimeout(timer);
        }
    }, [authStatus, router]); // Dependencies: authStatus and router

    // Show loading state while session is loading
    if (authStatus === 'loading') {
        return (
            <div className="flex flex-col min-h-screen">
                <AppHeader />
                <main className="flex-grow container mx-auto py-6">
                </main>
                <AppFooter pageTitle="Monitoring & Analytics" />
            </div>
        );
    }

    // Render "Not Authenticated" if not logged in
    if (authStatus === 'unauthenticated') {
        return (
            <div className="flex flex-col min-h-screen bg-background">
                <AppHeader />
                <main className="flex-grow container mx-auto p-4 md:p-8 flex flex-col items-center justify-center space-y-4">
                    <ClientOnly><LogIn className="h-16 w-16 text-primary" /></ClientOnly>
                    <h1 className="text-2xl font-semibold">Not Authenticated</h1>
                    <p className="text-muted-foreground">Please log in to access monitoring & analytics.</p>
                    {/* Added additional message and redirect */}
                    <p className="text-muted-foreground">Redirecting to Login in 10 seconds...</p>
                    <Button onClick={() => router.push('/auth/signin')}>Go to Login</Button> {/* Use router.push */}
                </main>
                <AppFooter pageTitle="Monitoring & Analytics" />
            </div>
        );
    }

    // Redirect if authenticated but not admin (this block now only renders the UI, the redirect is handled by useEffect)
    if (session?.user?.role !== Role.ADMIN && session?.user?.role !== Role.SUPER_ADMIN) {
        // The redirect for "Access Denied" is handled by the useEffect hook at the top level.
        // This block only renders the UI.
        return (
            <div className="flex flex-col min-h-screen bg-background">
                <AppHeader />
                <main className="flex-grow container mx-auto p-4 md:p-8 flex flex-col items-center justify-center space-y-4">
                    <ClientOnly><Ban className="h-16 w-16 text-destructive" /></ClientOnly>
                    <h1 className="text-2xl font-semibold">Access Denied</h1>
                    <p className="text-muted-foreground">You do not have permission to view this page.</p>
                    <p className="text-muted-foreground">Redirecting to Login in 10 seconds...</p>
                    <Button onClick={() => router.push('/')}>Go to Self-Service</Button>
                </main>
                <AppFooter pageTitle="Monitoring & Analytics" />
            </div>
        );
    }

    // Tab configuration for mobile dropdown
    const baseTabConfig = [
        { value: 'audit-logs', label: 'Audit Logs', icon: <Shield className="h-4 w-4" /> },
        { value: 'audit-analytics', label: 'Audit Analytics', icon: <FileText className="h-4 w-4" /> },
        { value: 'api-key-usage', label: 'API Key Usage', icon: <BarChart3 className="h-4 w-4" /> },
    ];

    const advancedTabConfig = [
        { value: 'session-analytics', label: 'Session Analytics', icon: <Users className="h-4 w-4" /> },
        { value: 'combined-analytics', label: 'Combined Analytics', icon: <Activity className="h-4 w-4" /> },
        { value: 'performance-analytics', label: 'Performance Analytics', icon: <BarChart3 className="h-4 w-4" /> },
        { value: 'realtime-monitor', label: 'Real-time Monitor', icon: <BarChart3 className="h-4 w-4" /> },
    ];

    const managementTabConfig = session?.user?.role === 'SUPER_ADMIN'
        ? [{ value: 'audit-log-management', label: 'Audit Management', icon: <Settings className="h-4 w-4" /> }]
        : [];

    // Conditionally include advanced analytics tabs
    const tabConfig = [
        ...baseTabConfig,
        ...(advancedAnalyticsEnabled ? advancedTabConfig : []),
        ...managementTabConfig
    ];

    const currentTab = tabConfig.find(tab => tab.value === activeTab);

    // If authorized, render the tabbed audit logs interface
    return (
        <div className="fixed inset-0 flex flex-col h-dynamic-screen overflow-hidden bg-background">
            <AppHeader />
            <main className="flex-grow container-responsive py-3 flex flex-col min-h-0 pb-16">
                <h1 className={`font-bold text-foreground mb-4 ${isMobile ? 'text-2xl' : 'text-3xl'}`}>Monitoring & Analytics</h1>

                <Tabs value={activeTab} className="w-full flex flex-col flex-grow min-h-0" onValueChange={setActiveTab}>
                    {/* Hidden TabsList for mobile - needed for Tabs component to work */}
                    <TabsList className={`${isMobile ? 'sr-only' : `grid w-full ${session?.user?.role === 'SUPER_ADMIN' ? 'grid-cols-8' : 'grid-cols-7'} h-auto`}`}>
                        {tabConfig.map((tab) => (
                            <TabsTrigger key={tab.value} value={tab.value}>
                                <ClientOnly><span className="mr-2">{tab.icon}</span></ClientOnly> {tab.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    {/* Mobile dropdown menu */}
                    {isMobile && (
                        <div className="w-full">
                            <DropdownMenu open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="outline"
                                        className="w-full justify-between h-12 text-left bg-muted/50 hover:bg-muted/70"
                                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                                    >
                                        <div className="flex items-center">
                                            <ClientOnly>
                                                {currentTab && (
                                                    <div className="mr-2">{currentTab.icon}</div>
                                                )}
                                            </ClientOnly>
                                            <span>{currentTab?.label || 'Audit Logs'}</span>
                                        </div>
                                        <ClientOnly>
                                            {isMobileMenuOpen ? (
                                                <ChevronUp className="h-4 w-4" />
                                            ) : (
                                                <ChevronDown className="h-4 w-4" />
                                            )}
                                        </ClientOnly>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="w-full min-w-[var(--radix-dropdown-menu-trigger-width)]">
                                    {tabConfig.map((tab) => (
                                        <DropdownMenuItem
                                            key={tab.value}
                                            onClick={() => {
                                                setActiveTab(tab.value);
                                                setIsMobileMenuOpen(false);
                                            }}
                                            className="flex items-center py-3"
                                        >
                                            <ClientOnly>
                                                <div className="mr-3">{tab.icon}</div>
                                            </ClientOnly>
                                            {tab.label}
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    )}

                    {/* Single content area with conditional rendering */}
                    <div className="mt-4 w-full min-w-0 flex-grow flex flex-col min-h-0">
                        {activeTab === 'audit-logs' && <AuditLogsClient />}
                        {activeTab === 'api-key-usage' && <ApiKeyUsageDashboard />}
                        {activeTab === 'audit-analytics' && <AuditLogAnalyticsDashboard />}
                        {activeTab === 'session-analytics' && advancedAnalyticsEnabled && <SessionAnalyticsDashboard />}
                        {activeTab === 'combined-analytics' && advancedAnalyticsEnabled && <CombinedAnalyticsDashboard />}
                        {activeTab === 'performance-analytics' && advancedAnalyticsEnabled && <PerformanceAnalyticsDashboard />}
                        {activeTab === 'realtime-monitor' && advancedAnalyticsEnabled && <RealTimeMonitor />}
                        {activeTab === 'audit-log-management' && session?.user?.role === 'SUPER_ADMIN' && <AuditManagementTab />}
                    </div>
                </Tabs>
            </main>
            <AppFooter pageTitle="Monitoring & Analytics" />
        </div>
    );
}