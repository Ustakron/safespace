import { createHmac, randomBytes, timingSafeEqual, pbkdf2Sync } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';

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

const USERS_KEY = 'safe-space-users';
const LOCAL_DB = path.join(process.cwd(), '.data', 'users.json');

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function secret() {
  return process.env.AUTH_SECRET || 'safe-space-dev-secret-change-on-vercel';
}

function kvConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

async function kvCommand<T>(command: unknown[]): Promise<T | null> {
  const cfg = kvConfig();
  if (!cfg) return null;
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command),
    cache: 'no-store'
  });
  if (!res.ok) throw new Error(`KV command failed: ${res.status}`);
  const data = await res.json();
  return data.result as T;
}

async function readLocalUsers(): Promise<Record<string, UserRecord>> {
  try {
    return JSON.parse(await readFile(LOCAL_DB, 'utf8'));
  } catch {
    return {};
  }
}

async function writeLocalUsers(users: Record<string, UserRecord>) {
  await mkdir(path.dirname(LOCAL_DB), { recursive: true });
  await writeFile(LOCAL_DB, JSON.stringify(users, null, 2));
}

export async function getUser(email: string): Promise<UserRecord | null> {
  const key = normalizeEmail(email);
  const kvUser = await kvCommand<string | null>(['HGET', USERS_KEY, key]);
  if (kvUser !== null) return kvUser ? JSON.parse(kvUser) : null;
  const users = await readLocalUsers();
  return users[key] || null;
}

export async function saveUser(user: UserRecord) {
  const key = normalizeEmail(user.email);
  const record = { ...user, email: key, updatedAt: new Date().toISOString() };
  const kvSaved = await kvCommand<number>(['HSET', USERS_KEY, key, JSON.stringify(record)]);
  if (kvSaved !== null) return record;
  const users = await readLocalUsers();
  users[key] = record;
  await writeLocalUsers(users);
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
  return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
}

export function createToken(email: string) {
  const payload = Buffer.from(JSON.stringify({
    email: normalizeEmail(email),
    exp: Date.now() + 1000 * 60 * 60 * 24 * 30
  })).toString('base64url');
  const sig = createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function readToken(authHeader: string | null) {
  const raw = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const [payload, sig] = raw.split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', secret()).update(payload).digest('base64url');
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { email: string; exp: number };
  if (!data.email || Date.now() > data.exp) return null;
  return normalizeEmail(data.email);
}

export function publicUser(user: UserRecord, token?: string) {
  return {
    name: user.name,
    email: user.email,
    avatar: user.avatar || '',
    ...(token ? { token } : {})
  };
}

export function jsonError(detail: string, status = 400) {
  return Response.json({ detail }, { status });
}
