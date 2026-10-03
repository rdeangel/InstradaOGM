const KNOWN_WEAK_HEX = '0123456789abcdef'.repeat(4);
const PLACEHOLDER_TEXT = /REPLACE_ME|CHANGE_?ME|CHANGE_THIS|your_|generate|dev-secret|placeholder|example/i;

function isRepeatedChar(value: string): boolean {
  return value.length > 0 && [...value].every((ch) => ch === value[0]);
}

type SecretEnv = {
  NEXTAUTH_SECRET?: string;
  BACKUP_ENCRYPTION_SECRET_KEY?: string;
};

export function placeholderSecretWarnings(env: SecretEnv = process.env): string[] {
  const warnings: string[] = [];
  const auth = env.NEXTAUTH_SECRET;
  if (!auth || auth.length < 32 || PLACEHOLDER_TEXT.test(auth) || auth === KNOWN_WEAK_HEX) {
    warnings.push(
      'NEXTAUTH_SECRET is missing, too short, or still a placeholder. Generate one with `openssl rand -base64 32`.',
    );
  }

  const backup = env.BACKUP_ENCRYPTION_SECRET_KEY;
  if (
    !backup ||
    !/^[0-9a-f]{64}$/i.test(backup) ||
    backup.toLowerCase() === KNOWN_WEAK_HEX ||
    isRepeatedChar(backup)
  ) {
    warnings.push(
      'BACKUP_ENCRYPTION_SECRET_KEY is missing, not 64 hex chars, or still a placeholder. Generate one with `openssl rand -hex 32`.',
    );
  }

  return warnings;
}
