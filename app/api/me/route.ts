import { getUser, jsonError, publicUser, readToken, saveUser } from '@/app/lib/auth';

export async function PUT(req: Request) {
  const email = readToken(req.headers.get('authorization'));
  if (!email) return jsonError('กรุณาเข้าสู่ระบบใหม่', 401);
  const user = await getUser(email);
  if (!user) return jsonError('ไม่พบผู้ใช้', 404);
  const { name, avatar } = await req.json();
  if (!name) return jsonError('กรุณากรอกชื่อ');
  const updated = await saveUser({
    ...user,
    name: String(name).trim(),
    avatar: avatar === undefined ? user.avatar : String(avatar || '')
  });
  return Response.json(publicUser(updated));
}
