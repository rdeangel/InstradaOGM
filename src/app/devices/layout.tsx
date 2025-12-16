import React from 'react'; // Import React
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { userHasDeviceAccess } from '@/lib/user-permissions'; // Import the permission check function

export default async function DevicesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  // 1. Check if user is authenticated - Removed server-side redirect to allow client-side handling
  // if (!session) {
  //   redirect('/auth/signin');
  // }

  // 2. Check if user has Device Management based on group permissions
  // We need the user ID from the session
  let hasDeviceAccess = false; // Default to false

  if (session?.user?.id) {
    const userId = (session.user as { id: string }).id; // Assuming user ID is available on session.user
    hasDeviceAccess = await userHasDeviceAccess(userId); // Rename variable for clarity
  }


   // Allow authenticated users to access the page, regardless of Device Management.
   // The page component will handle displaying content based on hasDeviceAccess.

   // 3. Render the page content, passing the Device Management status
   // We need to clone the children element to pass a prop to it.
   // Assuming children is a single React element (the page component)
   // 3. Render the page content
   // Pass hasDeviceAccess as a prop to the page component
   return React.cloneElement(children as React.ReactElement, { hasDeviceAccess });
 }