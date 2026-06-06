import { createToken, getUser, hashPassword, jsonError, publicUser, saveUser } from '@/app/lib/auth';

export async function POST(req: Request) {
  const { name, email, password } = await req.json();
  if (!name || !email || !password) return jsonError('กรุณากรอกข้อมูลให้ครบถ้วน');
  if (await getUser(email)) return jsonError('อีเมลนี้ถูกใช้งานแล้ว', 409);
  const now = new Date().toISOString();
  const user = await saveUser({
    name: String(name).trim(),
    email,
    passwordHash: hashPassword(String(password)),
    createdAt: now,
    updatedAt: now
  });
  return Response.json(publicUser(user, createToken(user.email)));
}
