// src/app/account/page.tsx
'use client'; // This is a client component
import React, { useEffect, useState } from 'react'; // Import useState
import { useSession, signOut } from 'next-auth/react'; // Import useSession and signOut
import { useRouter } from 'next/navigation'; // Import useRouter for client-side navigation
import TwoFactorAuthSettings from '@/components/TwoFactorAuthSettings'; // Import the 2FA settings component
import ApiKeyManagement from '@/components/ApiKeyManagement'; // Import the API key management component
import UserActivityDashboard from '@/components/account/UserActivityDashboard'; // Import the consolidated user activity dashboard component

import { AppHeader } from '@/components/layout/AppHeader'; // Import AppHeader
import { AppFooter } from '@/components/layout/AppFooter'; // Import AppFooter
import { Button } from '@/components/ui/button'; // Import Button
import { ClientOnly } from '@/components/util/ClientOnly'; // Import ClientOnly
import { LogIn, Loader2, User, Shield, Key, Activity, ChevronDown, ChevronUp } from 'lucide-react'; // Import icons
import { useForm } from 'react-hook-form'; // Import useForm
import { zodResolver } from '@hookform/resolvers/zod'; // Import zodResolver
import { z } from 'zod'; // Import z from zod
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'; // Import form components
import { Input } from '@/components/ui/input'; // Import Input
import { useToast } from '@/hooks/use-toast'; // Import useToast
import { updateCurrentUserProfile } from '@/lib/actions/user.actions'; // Import the new action
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  // AlertDialogTrigger, // Removed unused import
} from "@/components/ui/alert-dialog"; // Import AlertDialog components
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"; // Import Card components
import { ScrollArea } from "@/components/ui/scroll-area"; // Import ScrollArea component
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"; // Import Tabs components
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'; // Import DropdownMenu components
import { useIsMobile } from '@/hooks/use-mobile'; // Import useIsMobile hook
import { useLocalStorage } from '@/hooks/use-local-storage'; // Import useLocalStorage hook


// Define the form schema for profile updates
const getPasswordMinLength = () => parseInt(process.env.AUTH_PASSWORD_MIN_LENGTH || '8');

const ProfileFormSchema = z.object({
  name: z.string().optional().or(z.literal('')), // Add name field
  username: z.string().optional().or(z.literal('')), // Add username field
  email: z.string().email("Invalid email address").optional().or(z.literal('')),
  password: z.string().min(getPasswordMinLength(), `Password must be at least ${getPasswordMinLength()} characters`).optional().or(z.literal('')),
  confirmPassword: z.string().optional().or(z.literal('')),
}).refine((data) => {
  // Only validate password confirmation if password is provided
  if (data.password && data.password !== '') {
    return data.password === data.confirmPassword;
  }
  return true;
}, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type ProfileFormValues = z.infer<typeof ProfileFormSchema>;


export default function AccountPage() {
  const { data: session, status, update } = useSession(); // Include update from useSession
  const router = useRouter(); // Initialize useRouter
  const { toast } = useToast(); // Initialize useToast
  const isMobile = useIsMobile(); // Initialize useIsMobile hook

  // State for controlling the email update success modal
  const [showEmailUpdateModal, setShowEmailUpdateModal] = useState(false);

  // State for tab management
  const [activeTab, setActiveTab] = useLocalStorage<string>('account-active-tab', 'profile');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Initialize the form with default values outside of conditional block
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(ProfileFormSchema),
    defaultValues: {
      name: '',
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
    mode: 'onChange', // Validate on change
  });

  // Use useEffect to reset form when session data becomes available
  useEffect(() => {
    if (session?.user) {
      form.reset({
        name: session.user.name || '',
        username: session.user.username || '', // Use correct type
        email: session.user.email || '',
        password: '',
        confirmPassword: '',
      });
    }
  }, [session, form]);


  // Show loading state while authentication status is being determined
  useEffect(() => {
    if (status === 'unauthenticated') {
      const timer = setTimeout(() => {
        router.push('/login'); // Redirect to login page
      }, 10000); // 10 seconds

      return () => clearTimeout(timer);
    }
  }, [status, router]);
  if (status === 'loading') {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <AppHeader />
        <main className="flex-grow container mx-auto p-4 md:p-8 flex items-center justify-center">
          <ClientOnly><Loader2 className="h-12 w-12 animate-spin text-primary" /></ClientOnly>
        </main>
      </div>
    );
  }

  // Show Not Authenticated message and button to redirect
  if (status === 'unauthenticated') {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <AppHeader />
        <main className="flex-grow container mx-auto p-4 md:p-8 flex flex-col items-center justify-center space-y-4">
          <ClientOnly><LogIn className="h-16 w-16 text-primary" /></ClientOnly>
          <h1 className="text-2xl font-semibold">Not Authenticated</h1>
          <p className="text-muted-foreground">Please log in to access your account.</p>
          <p className="text-muted-foreground">Redirecting to Login in 10 seconds...</p>
          <Button onClick={() => router.push('/login')}>Go to Login</Button>
        </main>
      </div>
    );
  }

  // This block is only reached if status is 'authenticated'
  if (status === 'authenticated') {
    const isOidc = session?.user?.authMethod === 'oauth';

    // Tab configuration - filter out Security tab for OIDC users
    const tabConfig = [
      { value: 'profile', label: 'Profile', icon: <User className="h-4 w-4" /> },
      { value: 'security', label: 'Security', icon: <Shield className="h-4 w-4" /> },
      { value: 'api-keys', label: 'API Keys', icon: <Key className="h-4 w-4" /> },
      { value: 'activity', label: 'Activity', icon: <Activity className="h-4 w-4" /> },
    ].filter(tab => !isOidc || tab.value !== 'security'); // Remove Security tab for OIDC users

    const currentTab = tabConfig.find(tab => tab.value === activeTab);

    // Handle form submission
    async function onSubmit(values: ProfileFormValues) {
      // Filter out empty values and unchanged values so we only send fields that were changed
      const dataToUpdate: { name?: string; username?: string; email?: string; password?: string } = {};
      if (values.name && values.name !== session?.user?.name) {
        dataToUpdate.name = values.name;
      }
      if (values.username && values.username !== session?.user?.username) { // Use correct type
        dataToUpdate.username = values.username;
      }
      if (values.email && values.email !== session?.user?.email) {
        dataToUpdate.email = values.email;
      }
      if (values.password) { // Only include password if it's not empty
        dataToUpdate.password = values.password;
      }

      // Only proceed if there's data to update
      if (Object.keys(dataToUpdate).length === 0) {
        toast({
          title: "No changes detected",
          description: "Please change your email or password to update your profile.",
          variant: "default",
        });
        return;
      }


      const result = await updateCurrentUserProfile(dataToUpdate);

      if (result.success) {
        // Manually update the session to reflect the new email if it changed
        // If email or name was updated, show the modal and trigger logout
        if (dataToUpdate.email || dataToUpdate.name) {
          setShowEmailUpdateModal(true); // Show the modal
        } else {
          // If only password or username were updated, refresh the session with the updated user data and show success toast
          await update({ user: result.user }); // Refresh the session with updated user data
          toast({
            title: "Profile Updated",
            description: "Your profile has been updated successfully.",
            variant: "default",
          });
          form.reset({ // Reset the form, keeping the potentially updated email
            email: session?.user?.email || '', // Use the email from the updated session
            password: '', // Clear the password field
            confirmPassword: '', // Clear the confirm password field
          });
        }
      } else {
        toast({
          title: "Update Failed",
          description: result.errors?.[0]?.message || "An error occurred while updating your profile.",
          variant: "destructive",
        });
      }
    }


    return (
      <div className="fixed inset-0 flex flex-col h-dynamic-screen overflow-hidden bg-background">
        <AppHeader />
        <main className="flex-grow container-responsive py-3 flex flex-col min-h-0 pb-16">
          <div className="flex items-center justify-between mb-4">
            <h1 className={`font-bold text-foreground ${isMobile ? 'text-2xl' : 'text-3xl'}`}>Account</h1>
          </div>

          <Tabs value={activeTab} className="w-full flex flex-col flex-grow min-h-0" onValueChange={setActiveTab}>
            {/* Hidden TabsList for mobile - needed for Tabs component to work */}
            <TabsList className={`${isMobile ? 'sr-only' : 'grid w-full grid-cols-1 sm:grid-cols-2 md:grid-cols-4 h-auto'}`}>
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
                        <span>{currentTab?.label || 'Profile'}</span>
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

            <div className="mt-4 w-full min-w-0 flex-grow flex flex-col min-h-0">
              {/* Profile Tab */}
              {activeTab === 'profile' && (
                <div className="h-full">
                  <Card className="flex flex-col h-full">
                    <CardHeader>
                      <CardTitle>User Information</CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-hidden p-0 flex flex-col">
                      <ScrollArea className="flex-1 h-full w-full">
                        <div className="space-y-4 p-6">
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            Authentication Method: <span className="font-semibold">{session?.user?.authMethod === 'oauth' ? 'Single Sign-On (SSO)' : 'Local'}</span>
                          </p>

                          {/* Profile Information Section */}
                          <Form {...form} key={session?.user?.email}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                              {/* Name Field (Always rendered, disabled for OIDC users) */}
                              <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className={isOidc ? 'text-gray-500 dark:text-gray-500' : ''}>Name</FormLabel>
                                    <FormControl>
                                      <Input
                                        {...field}
                                        value={field.value ?? ''} // Ensure value is never undefined
                                        type="text"
                                        disabled={isOidc} // Disable for OIDC users
                                        className={isOidc ? 'text-gray-500 dark:text-gray-500 italic' : ''}
                                      />
                                    </FormControl>
                                    {/* Always render FormMessage, but it will be empty if no error */}
                                    <FormMessage />
                                    {isOidc && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Provided by SSO</p>} {/* Indicate SSO for OIDC */}
                                  </FormItem>
                                )}
                              />

                              {/* Username Field (Always rendered, disabled for OIDC users) */}
                              <FormField
                                control={form.control}
                                name="username"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className={isOidc ? 'text-gray-500 dark:text-gray-500' : ''}>Username</FormLabel>
                                    <FormControl>
                                      <Input
                                        {...field}
                                        value={field.value ?? ''} // Ensure value is never undefined
                                        type="text"
                                        disabled // Disable for all users
                                        className="text-gray-500 dark:text-gray-500 italic" // Always gray out
                                      />
                                    </FormControl>
                                    {/* Always render FormMessage, but it will be empty if no error */}
                                    <FormMessage />
                                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Username cannot be changed.</p> {/* Indicate it cannot be changed */}
                                  </FormItem>
                                )}
                              />

                              {/* Email Field (Always rendered, disabled for OIDC users) */}
                              <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className={isOidc ? 'text-gray-500 dark:text-gray-500' : ''}>Email</FormLabel>
                                    <FormControl>
                                      <Input
                                        {...field}
                                        value={field.value ?? ''} // Ensure value is never undefined
                                        type="email"
                                        disabled={isOidc} // Disable for OIDC users
                                        className={isOidc ? 'text-gray-500 dark:text-gray-500 italic' : ''}
                                      />
                                    </FormControl>
                                    {/* Always render FormMessage, but it will be empty if no error */}
                                    <FormMessage />
                                    {isOidc && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Provided by SSO</p>} {/* Indicate SSO for OIDC */}
                                  </FormItem>
                                )}
                              />

                              {/* Password Field (Always rendered, disabled for OIDC users) */}
                              <FormField
                                control={form.control}
                                name="password"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className={isOidc ? 'text-gray-500 dark:text-gray-500' : ''}>Password</FormLabel>
                                    <FormControl>
                                      <Input
                                        {...field}
                                        value={field.value ?? ''} // Ensure value is never undefined
                                        type="password"
                                        placeholder={isOidc ? 'Managed by SSO provider' : 'Leave blank to keep current password'}
                                        disabled={isOidc} // Disable for OIDC users
                                        className={isOidc ? 'text-gray-500 dark:text-gray-500 italic' : ''}
                                      />
                                    </FormControl>
                                    {/* Always render FormMessage, but it will be empty if no error */}
                                    <FormMessage />
                                    {isOidc && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Managed by SSO provider</p>} {/* Indicate SSO for OIDC */}
                                  </FormItem>
                                )}
                              />

                              {/* Confirm Password Field (Always rendered, disabled for OIDC users) */}
                              <FormField
                                control={form.control}
                                name="confirmPassword"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className={isOidc ? 'text-gray-500 dark:text-gray-500' : ''}>Confirm Password</FormLabel>
                                    <FormControl>
                                      <Input
                                        {...field}
                                        value={field.value ?? ''} // Ensure value is never undefined
                                        type="password"
                                        placeholder={isOidc ? 'Managed by SSO provider' : 'Confirm your new password'}
                                        disabled={isOidc} // Disable for OIDC users
                                        className={isOidc ? 'text-gray-500 dark:text-gray-500 italic' : ''}
                                      />
                                    </FormControl>
                                    <FormMessage />
                                    {isOidc && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Managed by SSO provider</p>} {/* Indicate SSO for OIDC */}
                                  </FormItem>
                                )}
                              />

                              {/* Update Button (Always rendered, disabled for OIDC users) */}
                              <Button type="submit" disabled={isOidc || form.formState.isSubmitting}>
                                {form.formState.isSubmitting ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : null}
                                Update Profile
                              </Button>
                            </form>
                          </Form>
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Security Tab - Only for non-OIDC users */}
              {activeTab === 'security' && !isOidc && (
                <div className="h-full">
                  <TwoFactorAuthSettings />
                </div>
              )}

              {/* API Keys Tab */}
              {activeTab === 'api-keys' && (
                <div className="h-full">
                  <ApiKeyManagement />
                </div>
              )}

              {/* Activity Tab */}
              {activeTab === 'activity' && (
                <div className="h-full">
                  <UserActivityDashboard userId={session?.user?.id || ''} />
                </div>
              )}
            </div>
          </Tabs>
        </main >
        <AppFooter pageTitle="Account" />

        {/* Email Update Success Modal */}
        <AlertDialog open={showEmailUpdateModal} onOpenChange={setShowEmailUpdateModal}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Profile Updated</AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogDescription>
              Your profile information has been updated. Please log in again for the changes to take effect.
            </AlertDialogDescription>
            <AlertDialogFooter>
              <Button onClick={() => signOut({ callbackUrl: '/login' })}>OK</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // Fallback return for when status is not 'authenticated' (should be covered by early returns)
  return null;
}