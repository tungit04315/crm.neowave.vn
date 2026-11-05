import { authenticate, type Ctx } from './auth';
import { HttpError } from './errors';

/** Bọc mọi API: xác thực → chạy xử lý → trả JSON. Lỗi nội bộ không lộ chi tiết kỹ thuật cho người dùng. */
export async function route(req: Request, fn: (c: Ctx) => Promise<unknown>): Promise<Response> {
  try {
    const out = await fn(await authenticate(req));
    return out instanceof Response ? out : Response.json(out);
  } catch (e) {
    // Tín hiệu nội bộ của Next.js (ví dụ thoát khỏi prerender) phải được chuyển tiếp, không được nuốt
    if (typeof (e as { digest?: unknown })?.digest === 'string') throw e;
    if (e instanceof HttpError) return Response.json({ error: { code: e.code, message: e.message } }, { status: e.status });
    console.error('[api]', e);
    return Response.json({ error: { code: 'internal', message: 'Có lỗi khi xử lý ở máy chủ. Vui lòng thử lại.' } }, { status: 500 });
  }
}
export async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.length > 20_000) throw new HttpError(413, 'too-large', 'Dữ liệu gửi lên quá lớn.');
  try { return JSON.parse(text || '{}'); } catch { throw new HttpError(400, 'bad-json', 'Dữ liệu gửi lên không hợp lệ.'); }
}
