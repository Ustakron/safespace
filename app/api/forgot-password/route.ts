import { getUser, hashPassword, jsonError, saveUser } from '@/app/lib/auth';

function makePassword() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export async function POST(req: Request) {
  const { email } = await req.json();
  if (!email) return jsonError('กรุณากรอกอีเมล');
  const user = await getUser(email);
  if (!user) return jsonError('ไม่พบอีเมลนี้ในระบบ', 404);
  const newPassword = makePassword();
  await saveUser({ ...user, passwordHash: hashPassword(newPassword) });
  return Response.json({ new_password: newPassword });
}
