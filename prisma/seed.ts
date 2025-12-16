
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminName = 'Admin User';
  const adminUsername = 'admin';
  const adminEmail = 'admin@example.com'; // Unique email is required by schema
  const adminPassword = 'admin';

  // Check if admin user already exists by username
  const existingAdmin = await prisma.user.findUnique({
    where: { username: adminUsername },
  });

  if (existingAdmin) {
    console.log(`Admin user with username "${adminUsername}" already exists. Seeding skipped for admin user.`);
  } else {
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    await prisma.user.create({
      data: {
        name: adminName, // Set name to "Admin User"
        username: adminUsername, // Set username to "admin"
        email: adminEmail,
        password: hashedPassword,
        role: 'SUPER_ADMIN', // Use string value for role
        emailVerified: new Date(), // Mark as verified for simplicity in local auth
        mustChangePassword: true, // Force password change on first login
        passwordChangedAt: new Date(), // Set initial password change timestamp
      },
    });
    console.log(`Admin user "${adminUsername}" created successfully with password "${adminPassword}".`);
  }

  // The regular user 'user@example.com' will no longer be seeded.
  // If you need other specific users, they can be added here with similar existence checks.

  // Seed global settings
  let globalSettingsRecord = await prisma.globalSettings.findFirst();

  if (globalSettingsRecord) {
    console.log('Global settings record already exists. Seeding skipped for global settings.');
  } else {
    globalSettingsRecord = await prisma.globalSettings.create({
      data: {
        enableRegistration: false, // Default to disabled
        removeSelfServicePage: false, // Default to enabled (self-service available)
        enableRenamingSelfServicePage: false,
        enableRenamingDeviceManagementPage: false,
        allowedNetworks: [],
        customLucideIcons: [],
        customEmojis: [],
        customFlags: [],
      },
    });
    console.log('Global settings record seeded successfully with default values.');
  }

}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
