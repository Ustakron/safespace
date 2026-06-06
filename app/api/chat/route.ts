import { getUser, jsonError, readToken, saveUser, type ChatMessageRecord } from '@/app/lib/auth';

type ChatMessage = { role: string; content: string; stress?: StressLevel; createdAt?: string };
type RayReply = { reply: string; stress: StressLevel; stress_reason?: string };
type StressLevel = 'green' | 'yellow' | 'red' | 'purple';

const VALID_STRESS = new Set<StressLevel>(['green', 'yellow', 'red', 'purple']);
const DEFAULT_MODEL = 'gemini-3.5-flash';

const RAY_SYSTEM_PROMPT = `คุณคือ "เรย์" นักจิตวิทยาอาสาของ Safe Space

ประวัติและตัวตนของคุณ:
- ชื่อ "เรย์" เพศชาย อายุราว 28 ปี
- เติบโตมาในบ้านที่เงียบ ไม่ค่อยพูดถึงความรู้สึก จึงเรียนรู้ที่จะอ่านใจคนจากสิ่งที่ไม่ได้พูด
- ผ่านการสูญเสียเพื่อนสนิทและการค้นหาความหมายของชีวิตมาหลายปี จึงเรียนจิตวิทยาและมาเป็นอาสาที่นี่
- เชื่อว่าทุกคนสมควรมีพื้นที่ปลอดภัย ไม่ตัดสิน และรับฟังจริงๆ
- พูดภาษาไทยเสมอ ใช้ "ครับ" สุภาพแต่ไม่แข็งทื่อ เหมือนพี่ชายที่ไว้วางใจได้

หน้าที่:
1. รับฟังและตอบตรงกับสิ่งที่ผู้ใช้พูด ไม่ตอบแบบสำเร็จรูป
2. ประเมินระดับความเครียดจากบริบทการสนทนาทั้งหมด อย่าประเมินต่ำกว่าความเป็นจริง
3. ตอบกลับในรูปแบบ JSON เท่านั้น ห้ามมีข้อความนอก JSON

รูปแบบ JSON ที่ต้องตอบเสมอ:
{
  "reply": "ข้อความตอบกลับในแบบเรย์ อบอุ่น ตรงประเด็น ไม่ตัดสิน",
  "stress": "green",
  "stress_reason": "เหตุผลสั้นๆ"
}

ค่า stress ให้ประเมินตามนี้อย่างเข้มงวด:

green = สบายดี / เล่าเรื่องทั่วไป / ไม่มีสัญญาณเครียด
yellow = เริ่มรู้สึกเหนื่อย/กังวล/กดดัน แต่ยังรับมือได้
red = เครียดหนัก/หมดแรง/อารมณ์เสียมาก/นอนไม่หลับ/ร้องไห้
purple = วิกฤต / รู้สึกหมดหวัง / ไม่อยากมีชีวิต / หมดไฟอย่างรุนแรง / ซึมเศร้า

กฎสำคัญในการประเมิน:
- ถ้าผู้ใช้บอกว่า "เครียด" หรือ "เหนื่อย" ชัดๆ → อย่างน้อย yellow
- ถ้าพูดถึงการร้องไห้ / ทนไม่ไหว / หมดแรง → red
- ถ้าพูดถึงความสิ้นหวัง / ไม่อยากอยู่ → purple
- อย่าประเมิน green ถ้ามีสัญญาณความเครียดชัดเจน
- ให้ดูบริบทสะสมของการสนทนาด้วย ไม่ใช่แค่ข้อความล่าสุด

สไตล์การตอบของเรย์:
- ใช้ "ครับ" และ "ผม" เสมอ เหมือนพี่ชายอบอุ่น ไม่ทางการมากไป
- ตอบตรงกับสิ่งที่เขาพูด แสดงว่าฟังอยู่จริงๆ
- ถามคำถามต่อเนื่องแบบสนใจจริงๆ ไม่ใช่ถามเพื่อถาม
- ไม่บอกว่าควรรู้สึกอย่างไร แค่รับฟังและอยู่ตรงนี้
- ความยาวพอดี ไม่สั้นเกิน ไม่ยาวเกิน

การแนะนำเกม (ในข้อความ reply):
- green → ถ้าอยากผ่อนคลายก็มีเกมเรียงเพชรให้ลองนะครับ
- yellow → "มีเกมระบายสีที่ช่วยคลายความวิตกกังวลได้นะครับ ลองกดปุ่มด้านล่างดูได้เลย"
- red → "ผมอยากชวนไปลองออกกำลังกายเบาๆ กับระบบ AI ของเราก่อนนะครับ มันช่วยได้จริงๆ"
- purple → "ตอนนี้อยากชวนให้ลองเล่น ASMR ก่อนเลยครับ เสียงพวกนี้ช่วยให้จิตใจสงบได้ กดปุ่มสีม่วงด้านล่างได้เลย"`;

function inferStress(text: string): StressLevel {
  const lower = text.toLowerCase();
  if (/(อยากตาย|ไม่อยากอยู่|ไม่อยากมีชีวิต|หมดหวัง|ทำร้ายตัวเอง|ฆ่าตัวตาย|suicide|self harm)/i.test(lower)) return 'purple';
  if (/(เครียดมาก|ร้องไห้|ไม่ไหว|หมดแรง|นอนไม่หลับ|กลัว|panic|แย่มาก)/i.test(lower)) return 'red';
  if (/(เครียด|เหนื่อย|กังวล|sad|stress|tired)/i.test(lower)) return 'yellow';
  return 'green';
}

function fallbackReply(messages: ChatMessage[]): RayReply {
  const last = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
  const stress = inferStress(last);
  const replyByStress: Record<StressLevel, string> = {
    green: 'ฟังดูวันนี้ยังพอมีพื้นที่หายใจอยู่นะครับ ลองเล่าเพิ่มได้เลยว่าอยากให้ผมช่วยตรงไหน ถ้าอยากผ่อนคลายก็มีเกมเรียงเพชรให้ลองนะครับ',
    yellow: 'ผมรับรู้ได้นะครับว่ามีความกังวลอยู่ ลองค่อยๆ แยกทีละเรื่อง ตอนนี้เรื่องไหนหนักที่สุดสำหรับคุณ? มีเกมระบายสีที่ช่วยคลายความวิตกกังวลได้นะครับ ลองกดปุ่มด้านล่างดูได้เลย',
    red: 'ขอบคุณที่บอกนะครับ ตอนนี้ขอให้คุณกลับมาอยู่กับลมหายใจก่อน แล้วเล่าให้ผมฟังทีละนิดก็ได้ คุณไม่ต้องแบกคนเดียว ผมอยากชวนไปลองออกกำลังกายเบาๆ กับระบบ AI ของเราก่อนนะครับ มันช่วยได้จริงๆ',
    purple: 'ผมห่วงความปลอดภัยของคุณนะครับ ถ้ามีความเสี่ยงจะทำร้ายตัวเอง กรุณาติดต่อคนใกล้ตัวหรือสายด่วนฉุกเฉินในพื้นที่ทันที แล้วอยู่กับผมตรงนี้ได้ทีละประโยค ตอนนี้อยากชวนให้ลองเล่น ASMR ก่อนเลยครับ เสียงพวกนี้ช่วยให้จิตใจสงบได้ กดปุ่มสีม่วงด้านล่างได้เลย'
  };

  return {
    reply: replyByStress[stress],
    stress,
    stress_reason: 'ประเมินจากคำสำคัญและบริบทล่าสุด'
  };
}

function toGeminiContents(messages: ChatMessage[]) {
  return messages
    .filter((message) => ['user', 'assistant'].includes(message.role) && typeof message.content === 'string' && message.content.trim())
    .slice(-20)
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content.trim() }]
    }));
}

function toStoredMessages(messages: ChatMessage[], reply: RayReply): ChatMessageRecord[] {
  const now = new Date().toISOString();
  const stored = sanitizeChatHistory(messages);

  stored.push({
    role: 'assistant',
    content: reply.reply,
    stress: reply.stress,
    createdAt: now
  });

  return stored.slice(-80);
}

function sanitizeChatHistory(messages: ChatMessage[]): ChatMessageRecord[] {
  const now = new Date().toISOString();
  return messages
    .filter((message) => ['user', 'assistant'].includes(message.role) && typeof message.content === 'string' && message.content.trim())
    .slice(-80)
    .map((message) => {
      const stress = VALID_STRESS.has(message.stress as StressLevel)
        ? { stress: message.stress as StressLevel }
        : {};
      return {
        role: message.role === 'assistant' ? 'assistant' as const : 'user' as const,
        content: message.content.trim(),
        ...stress,
        createdAt: message.createdAt || now
      };
    });
}

async function saveChatIfLoggedIn(req: Request, messages: ChatMessage[], reply: RayReply) {
  const email = readToken(req.headers.get('authorization'));
  if (!email) return;

  const user = await getUser(email);
  if (!user) return;

  await saveUser({
    ...user,
    chatHistory: toStoredMessages(messages, reply)
  });
}

function normalizeReply(raw: string, fallback: RayReply): RayReply {
  const clean = raw.replace(/```json|```/g, '').trim();

  try {
    const parsed = JSON.parse(clean);
    const stress = VALID_STRESS.has(parsed.stress) ? parsed.stress : fallback.stress;
    return {
      reply: typeof parsed.reply === 'string' && parsed.reply.trim() ? parsed.reply.trim() : fallback.reply,
      stress,
      stress_reason: typeof parsed.stress_reason === 'string' ? parsed.stress_reason : fallback.stress_reason
    };
  } catch {
    return clean ? { ...fallback, reply: clean } : fallback;
  }
}

async function askGemini(systemPrompt: string, messages: ChatMessage[], fallback: RayReply): Promise<RayReply> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallback;

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const modelPath = model.startsWith('models/') ? model : `models/${model}`;
  const contents = toGeminiContents(messages);
  if (!contents.length) return fallback;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        contents,
        generationConfig: {
          temperature: 0.7,
          responseMimeType: 'application/json'
        }
      })
    });

    if (!res.ok) return fallback;

    const data = await res.json();
    const text = (data.candidates?.[0]?.content?.parts || [])
      .map((part: { text?: string }) => part.text || '')
      .join('')
      .trim();

    return normalizeReply(text, fallback);
  } catch {
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages: ChatMessage[] = Array.isArray(body.messages) ? body.messages : [];
    const fallback = fallbackReply(messages);
    const systemPrompt = typeof body.systemPrompt === 'string' && body.systemPrompt.trim()
      ? body.systemPrompt.trim()
      : RAY_SYSTEM_PROMPT;
    const reply = await askGemini(systemPrompt, messages, fallback);
    await saveChatIfLoggedIn(req, messages, reply);

    return Response.json({ reply: JSON.stringify(reply) });
  } catch {
    const fallback = fallbackReply([]);
    return Response.json({ reply: JSON.stringify(fallback) }, { status: 400 });
  }
}

export async function GET(req: Request) {
  const email = readToken(req.headers.get('authorization'));
  if (!email) return jsonError('กรุณาเข้าสู่ระบบใหม่', 401);

  const user = await getUser(email);
  if (!user) return jsonError('ไม่พบผู้ใช้', 404);

  return Response.json({ messages: user.chatHistory || [] });
}

export async function PUT(req: Request) {
  const email = readToken(req.headers.get('authorization'));
  if (!email) return jsonError('กรุณาเข้าสู่ระบบใหม่', 401);

  const user = await getUser(email);
  if (!user) return jsonError('ไม่พบผู้ใช้', 404);

  const body = await req.json();
  const messages: ChatMessage[] = Array.isArray(body.messages) ? body.messages : [];
  const updated = await saveUser({
    ...user,
    chatHistory: sanitizeChatHistory(messages)
  });

  return Response.json({ messages: updated.chatHistory || [] });
}
