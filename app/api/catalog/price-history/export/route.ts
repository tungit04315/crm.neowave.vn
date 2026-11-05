import { route } from '@/lib/server/http';
import { exportPriceLog } from '@/lib/server/price-log';

export const GET = (req: Request) => route(req, c => exportPriceLog(c, Object.fromEntries(new URL(req.url).searchParams)));
