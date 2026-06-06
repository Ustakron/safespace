import { createHmac, randomBytes, timingSafeEqual, pbkdf2Sync } from 'crypto';

export type UserRecord = {
  email: string;
  name: string;
  passwordHash: string;
  chatHistory?: ChatMessageRecord[];
  avatar?: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessageRecord = {
  role: 'user' | 'assistant';
  content: string;
  stress?: 'green' | 'yellow' | 'red' | 'purple';
  createdAt: string;
};

const USERS_KEY = Symbol.for('safe-space-users-memory');

const globalStore = globalThis as unknown as {
  [USERS_KEY]?: Record<string, UserRecord>;
};

const users: Record<string, UserRecord> = globalStore[USERS_KEY] || {};
globalStore[USERS_KEY] = users;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function secret() {
  return 'safe-space-demo-secret';
}

export async function getUser(email: string): Promise<UserRecord | null> {
  const key = normalizeEmail(email);
  return users[key] || null;
}

export async function saveUser(user: UserRecord) {
  const key = normalizeEmail(user.email);

  const record = {
    ...user,
    email: key,
    updatedAt: new Date().toISOString(),
  };

  users[key] = record;
  return record;
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;

  const check = pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex');

  try {
    return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
  } catch {
    return false;
  }
}

export function createToken(email: string) {
  const payload = Buffer.from(
    JSON.stringify({
      email: normalizeEmail(email),
      exp: Date.now() + 1000 * 60 * 60 * 24 * 30,
    })
  ).toString('base64url');

  const sig = createHmac('sha256', secret()).update(payload).digest('base64url');

  return `${payload}.${sig}`;
}

export function readToken(authHeader: string | null) {
  const raw = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const [payload, sig] = raw.split('.');

  if (!payload || !sig) return null;

  const expected = createHmac('sha256', secret()).update(payload).digest('base64url');

  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      email: string;
      exp: number;
    };

    if (!data.email || Date.now() > data.exp) return null;

    return normalizeEmail(data.email);
  } catch {
    return null;
  }
}

export function publicUser(user: UserRecord, token?: string) {
  return {
    name: user.name,
    email: user.email,
    avatar: user.avatar || '',
    ...(token ? { token } : {}),
  };
}

export function jsonError(detail: string, status = 400) {
  return Response.json({ detail }, { status });
}
