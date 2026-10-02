
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { resolveInitialAdminPassword, shouldCreateSeedAdmin } from '../src/lib/server/initial-admin';

// Load environment variables manually since this script is run directly via tsx/node
const envFiles = ['.env.production', '.env.development', '.env'];
for (const file of envFiles) {
  const filePath = path.join(process.cwd(), file);
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath, quiet: true });
    break; // Stop after finding the highest priority file
  }
}

const prisma = new PrismaClient();

async function main() {
  const adminName = 'Admin User';
  const adminUsername = 'admin';
  const adminEmail = 'admin@example.com'; // Unique email is required by schema
  const userCount = await prisma.user.count();

  if (!shouldCreateSeedAdmin(userCount)) {
    console.log(`User table is not empty (${userCount} user(s)). Seeding skipped for admin user.`);
  } else {
    const { password: adminPassword, generated } = resolveInitialAdminPassword(process.env.INITIAL_ADMIN_PASSWORD);
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    await prisma.user.create({
      data: {
        name: adminName,
        username: adminUsername,
        email: adminEmail,
        password: hashedPassword,
        role: 'SUPER_ADMIN',
        emailVerified: new Date(),
        mustChangePassword: true,
        passwordChangedAt: new Date(),
      },
    });
    if (generated) {
      console.log(`Admin user "${adminUsername}" created. Generated password (shown once): ${adminPassword}`);
    } else {
      console.log(`Admin user "${adminUsername}" created using INITIAL_ADMIN_PASSWORD. Change it after first login.`);
    }
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
