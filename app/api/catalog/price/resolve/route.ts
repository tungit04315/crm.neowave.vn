import { route } from '@/lib/server/http';
import { resolvePrice } from '@/lib/server/pricing';

export const GET = (req: Request) => route(req, c => resolvePrice(c, Object.fromEntries(new URL(req.url).searchParams)));
