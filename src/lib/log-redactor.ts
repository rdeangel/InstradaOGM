/* eslint-disable security/detect-object-injection */
// This file uses bracket notation with keys from function parameters for redaction. All uses are safe.
export function redactSensitiveData(data: unknown, sensitiveKeys: string[]): unknown {
  if (typeof data !== 'object' || data === null) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => redactSensitiveData(item, sensitiveKeys));
  }

  const redactedData: Record<string, unknown> = {};
  const dataObj = data as Record<string, unknown>;
  for (const key in dataObj) {
    if (Object.prototype.hasOwnProperty.call(dataObj, key)) {
      if (sensitiveKeys.includes(key)) {
        redactedData[key] = '[REDACTED]';
      } else {
        redactedData[key] = redactSensitiveData(dataObj[key], sensitiveKeys);
      }
    }
  }
  return redactedData;
}

export function redactConnectionString(input: string): string {
  if (typeof input !== 'string') {
    return input;
  }

  // Redact PGPASSWORD in command strings
  let redacted = input.replace(/(PGPASSWORD=)[^ ]+/g, '$1[REDACTED]');

  // Redact password in database URLs (e.g., postgresql://user:password@host:port/db)
  redacted = redacted.replace(/(:\/\/[^:]+:)([^@]+)(@)/g, '$1[REDACTED]$3');

  return redacted;
}