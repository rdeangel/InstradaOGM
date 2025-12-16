'use server';
import { logger } from '@/lib/logger';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { getServerSession } from 'next-auth'; // Import getServerSession
import { authOptions } from '@/lib/auth'; // Import authOptions

// Define schema for creating a group mapping
const CreateSsoGroupMappingSchema = z.object({
  ssoProvider: z.string().min(1, { message: "SSO Provider is required." }),
  ssoGroupName: z.string().min(1, { message: "SSO Group Name is required." }),
  localGroupId: z.string().min(1, { message: "Local Group is required." }),
});

export type CreateSsoGroupMappingState = {
  errors?: {
    ssoProvider?: string[];
    ssoGroupName?: string[];
    localGroupId?: string[];
    _form?: string[];
  };
  success?: boolean;
  message?: string;
};

export async function createSsoGroupMapping(prevState: CreateSsoGroupMappingState, formData: FormData): Promise<CreateSsoGroupMappingState> {
  const session = await getServerSession(authOptions); // Use getServerSession with authOptions
  if (!session || (session.user?.role !== 'ADMIN' && session.user?.role !== 'SUPER_ADMIN')) {
    return {
      errors: { _form: ['Unauthorized.'] },
      success: false,
      message: 'Unauthorized.',
    };
  }

  const validatedFields = CreateSsoGroupMappingSchema.safeParse({
    ssoProvider: formData.get('ssoProvider'),
    ssoGroupName: formData.get('ssoGroupName'),
    localGroupId: formData.get('localGroupId'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      success: false,
      message: 'Validation failed.',
    };
  }

  const { ssoProvider, ssoGroupName, localGroupId } = validatedFields.data;

  try {
    // Check if a mapping with the same provider and external group name already exists
    const existingMapping = await prisma.ssoGroupMapping.findUnique({
      where: {
        ssoProvider_ssoGroupName: {
          ssoProvider: ssoProvider,
          ssoGroupName: ssoGroupName,
        },
      },
    });

    if (existingMapping) {
      return {
        errors: {
          ssoGroupName: [`A mapping for SSO Provider "${ssoProvider}" and External Group "${ssoGroupName}" already exists.`],
        },
        success: false,
        message: 'Mapping already exists.',
      };
    }

    await prisma.ssoGroupMapping.create({
      data: {
        ssoProvider,
        ssoGroupName,
        localGroupId,
      },
    });

    revalidatePath('/admin/settings'); // Revalidate the settings page to show the new mapping

    return {
      success: true,
      message: 'Group mapping created successfully.',
    };

  } catch (error: unknown) {
    logger.error('Error creating group mapping:', error);
    // Attempt to extract a more specific error message if available
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return {
      errors: { _form: [`Failed to create group mapping: ${errorMessage}`] },
      success: false,
      message: `Failed to create group mapping: ${errorMessage}`,
    };
  }
}

// TODO: Implement updateSsoGroupMapping and deleteSsoGroupMapping functions