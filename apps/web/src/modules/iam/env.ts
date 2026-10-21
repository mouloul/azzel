import { readFileSync } from 'node:fs';
import path from 'node:path';

type EnvMap = Record<string, string>;

let cachedEnvFiles: EnvMap | null = null;

function parseEnvContent(content: string): EnvMap {
  const values: EnvMap = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }
    const separator = line.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2);
    if (quoted) {
      value = value.slice(1, -1);
    } else {
      const commentStart = value.indexOf(' #');
      if (commentStart >= 0) {
        value = value.slice(0, commentStart).trimEnd();
      }
    }
    values[key] = value;
  }
  return values;
}

function envFileCandidates(): string[] {
  const cwd = process.cwd();
  return [
    path.join(cwd, '.env'),
    path.join(cwd, '..', '.env'),
    path.join(cwd, '..', '..', '.env'),
  ];
}

function loadEnvFiles(): EnvMap {
  if (cachedEnvFiles) {
    return cachedEnvFiles;
  }
  const values: EnvMap = {};
  for (const candidate of [...envFileCandidates()].reverse()) {
    try {
      Object.assign(values, parseEnvContent(readFileSync(/*turbopackIgnore: true*/ candidate, 'utf8')));
    } catch {
      continue;
    }
  }
  cachedEnvFiles = values;
  return values;
}

export function applyEnvFilesToProcess(): void {
  for (const [key, value] of Object.entries(loadEnvFiles())) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function readEnv(name: string): string | null {
  applyEnvFilesToProcess();
  const value = process.env[name];
  return value !== undefined && value !== '' ? value : null;
}

export function readDatabaseUrl(): string | null {
  return readEnv('DATABASE_URL');
}

export function readSmtpUrl(): string | null {
  return readEnv('SMTP_URL');
}
