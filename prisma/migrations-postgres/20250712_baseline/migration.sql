-- CreateEnum
CREATE TYPE "VpnClientType" AS ENUM ('OpenVPN', 'WireGuard', 'IPsec');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "ext_expires_in" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "issuer" TEXT,
    "externalGroups" JSONB,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "username" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "password" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastActive" TIMESTAMP(3),
    "is2FAEnabled" BOOLEAN NOT NULL DEFAULT false,
    "passwordResetToken" TEXT,
    "passwordResetExpires" TIMESTAMP(3),
    "totpSecret" TEXT,
    "backupCodes" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "GroupFilterSetting" (
    "id" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupFilterSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SsoGroupMapping" (
    "id" TEXT NOT NULL,
    "ssoProvider" TEXT NOT NULL,
    "ssoGroupName" TEXT NOT NULL,
    "localGroupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SsoGroupMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpnsenseNetworkGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpnsenseNetworkGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupSpecificFilterSetting" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupSpecificFilterSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupHostAliasPermission" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "opnsenseAliasUuid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupHostAliasPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpnsenseGroupDisplay" (
    "id" TEXT NOT NULL,
    "opnsenseUuid" TEXT NOT NULL,
    "friendlyName" TEXT NOT NULL,
    "iconIdentifier" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpnsenseGroupDisplay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidLocalNetwork" (
    "id" TEXT NOT NULL,
    "network" TEXT,
    "startIp" TEXT,
    "endIp" TEXT,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ValidLocalNetwork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalSettings" (
    "id" TEXT NOT NULL,
    "enableRegistration" BOOLEAN NOT NULL DEFAULT false,
    "enableRenamingSelfServicePage" BOOLEAN NOT NULL DEFAULT false,
    "enableRenamingDeviceManagementPage" BOOLEAN NOT NULL DEFAULT false,
    "allowedNetworks" JSONB NOT NULL DEFAULT '[]',
    "customLucideIcons" JSONB NOT NULL DEFAULT '[]',
    "customEmojis" JSONB NOT NULL DEFAULT '[]',
    "customFlags" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "GlobalSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GloballyDisabledGroup" (
    "id" TEXT NOT NULL,
    "opnsenseUuid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GloballyDisabledGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "details" JSONB,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VpnMapping" (
    "id" TEXT NOT NULL,
    "vpnUuid" TEXT NOT NULL,
    "vpnName" TEXT NOT NULL,
    "vpnClient" "VpnClientType" NOT NULL DEFAULT 'OpenVPN',
    "friendlyName" TEXT,
    "opnsenseNetworkGroupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VpnMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsed" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "hourlyLimit" INTEGER DEFAULT 1000,
    "dailyLimit" INTEGER DEFAULT 10000,
    "monthlyLimit" INTEGER DEFAULT 100000,
    "burstLimit" INTEGER DEFAULT 100,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKeyRateLimit" (
    "id" TEXT NOT NULL,
    "apiKeyId" TEXT NOT NULL,
    "windowType" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "lastRequest" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKeyRateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_GroupToUser" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_GroupToUser_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "SsoGroupMapping_ssoProvider_ssoGroupName_key" ON "SsoGroupMapping"("ssoProvider", "ssoGroupName");

-- CreateIndex
CREATE UNIQUE INDEX "Group_name_key" ON "Group"("name");

-- CreateIndex
CREATE UNIQUE INDEX "OpnsenseNetworkGroup_name_key" ON "OpnsenseNetworkGroup"("name");

-- CreateIndex
CREATE UNIQUE INDEX "GroupSpecificFilterSetting_groupId_pattern_type_key" ON "GroupSpecificFilterSetting"("groupId", "pattern", "type");

-- CreateIndex
CREATE UNIQUE INDEX "GroupHostAliasPermission_groupId_opnsenseAliasUuid_key" ON "GroupHostAliasPermission"("groupId", "opnsenseAliasUuid");

-- CreateIndex
CREATE UNIQUE INDEX "OpnsenseGroupDisplay_opnsenseUuid_key" ON "OpnsenseGroupDisplay"("opnsenseUuid");

-- CreateIndex
CREATE UNIQUE INDEX "ValidLocalNetwork_network_startIp_endIp_type_key" ON "ValidLocalNetwork"("network", "startIp", "endIp", "type");

-- CreateIndex
CREATE UNIQUE INDEX "GloballyDisabledGroup_opnsenseUuid_key" ON "GloballyDisabledGroup"("opnsenseUuid");

-- CreateIndex
CREATE UNIQUE INDEX "VpnMapping_vpnUuid_key" ON "VpnMapping"("vpnUuid");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_userId_name_key" ON "ApiKey"("userId", "name");

-- CreateIndex
CREATE INDEX "ApiKeyRateLimit_apiKeyId_windowType_windowStart_idx" ON "ApiKeyRateLimit"("apiKeyId", "windowType", "windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKeyRateLimit_apiKeyId_windowType_windowStart_key" ON "ApiKeyRateLimit"("apiKeyId", "windowType", "windowStart");

-- CreateIndex
CREATE INDEX "_GroupToUser_B_index" ON "_GroupToUser"("B");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SsoGroupMapping" ADD CONSTRAINT "SsoGroupMapping_localGroupId_fkey" FOREIGN KEY ("localGroupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupSpecificFilterSetting" ADD CONSTRAINT "GroupSpecificFilterSetting_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupHostAliasPermission" ADD CONSTRAINT "GroupHostAliasPermission_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VpnMapping" ADD CONSTRAINT "VpnMapping_opnsenseNetworkGroupId_fkey" FOREIGN KEY ("opnsenseNetworkGroupId") REFERENCES "OpnsenseNetworkGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKeyRateLimit" ADD CONSTRAINT "ApiKeyRateLimit_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GroupToUser" ADD CONSTRAINT "_GroupToUser_A_fkey" FOREIGN KEY ("A") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GroupToUser" ADD CONSTRAINT "_GroupToUser_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
