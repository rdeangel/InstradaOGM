-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" DATETIME NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "username" TEXT,
    "email" TEXT,
    "emailVerified" DATETIME,
    "image" TEXT,
    "password" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastActive" DATETIME,
    "is2FAEnabled" BOOLEAN NOT NULL DEFAULT false,
    "passwordResetToken" TEXT,
    "passwordResetExpires" DATETIME,
    "totpSecret" TEXT,
    "backupCodes" TEXT
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GroupFilterSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pattern" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SsoGroupMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ssoProvider" TEXT NOT NULL,
    "ssoGroupName" TEXT NOT NULL,
    "localGroupId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SsoGroupMapping_localGroupId_fkey" FOREIGN KEY ("localGroupId") REFERENCES "Group" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OpnsenseNetworkGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GroupSpecificFilterSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GroupSpecificFilterSetting_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GroupHostAliasPermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "opnsenseAliasUuid" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GroupHostAliasPermission_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OpnsenseGroupDisplay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "opnsenseUuid" TEXT NOT NULL,
    "friendlyName" TEXT NOT NULL,
    "iconIdentifier" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ValidLocalNetwork" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "network" TEXT,
    "startIp" TEXT,
    "endIp" TEXT,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GlobalSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "enableRegistration" BOOLEAN NOT NULL DEFAULT false,
    "enableRenamingSelfServicePage" BOOLEAN NOT NULL DEFAULT false,
    "enableRenamingDeviceManagementPage" BOOLEAN NOT NULL DEFAULT false,
    "allowedNetworks" JSONB NOT NULL DEFAULT [],
    "customLucideIcons" JSONB NOT NULL DEFAULT [],
    "customEmojis" JSONB NOT NULL DEFAULT [],
    "customFlags" JSONB NOT NULL DEFAULT []
);

-- CreateTable
CREATE TABLE "GloballyDisabledGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "opnsenseUuid" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "details" JSONB,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VpnMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vpnUuid" TEXT NOT NULL,
    "vpnName" TEXT NOT NULL,
    "vpnClient" TEXT NOT NULL DEFAULT 'OpenVPN',
    "friendlyName" TEXT,
    "opnsenseNetworkGroupId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VpnMapping_opnsenseNetworkGroupId_fkey" FOREIGN KEY ("opnsenseNetworkGroupId") REFERENCES "OpnsenseNetworkGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsed" DATETIME,
    "expiresAt" DATETIME,
    "hourlyLimit" INTEGER DEFAULT 1000,
    "dailyLimit" INTEGER DEFAULT 10000,
    "monthlyLimit" INTEGER DEFAULT 100000,
    "burstLimit" INTEGER DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApiKeyRateLimit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "apiKeyId" TEXT NOT NULL,
    "windowType" TEXT NOT NULL,
    "windowStart" DATETIME NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "lastRequest" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApiKeyRateLimit_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_GroupToUser" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_GroupToUser_A_fkey" FOREIGN KEY ("A") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_GroupToUser_B_fkey" FOREIGN KEY ("B") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
CREATE UNIQUE INDEX "_GroupToUser_AB_unique" ON "_GroupToUser"("A", "B");

-- CreateIndex
CREATE INDEX "_GroupToUser_B_index" ON "_GroupToUser"("B");

