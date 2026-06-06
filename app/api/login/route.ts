import { createToken, getUser, jsonError, publicUser, verifyPassword } from '@/app/lib/auth';

export async function POST(req: Request) {
  const { email, password } = await req.json();
  if (!email || !password) return jsonError('กรุณากรอกอีเมลและรหัสผ่าน');
  const user = await getUser(email);
  if (!user || !verifyPassword(String(password), user.passwordHash)) {
    return jsonError('อีเมลหรือรหัสผ่านไม่ถูกต้อง', 401);
  }
  return Response.json(publicUser(user, createToken(user.email)));
}
