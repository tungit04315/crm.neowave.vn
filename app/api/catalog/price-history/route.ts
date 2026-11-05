import { route } from '@/lib/server/http';
import { listPriceLog } from '@/lib/server/price-log';

export const GET = (req: Request) => route(req, c => listPriceLog(c, Object.fromEntries(new URL(req.url).searchParams)));
