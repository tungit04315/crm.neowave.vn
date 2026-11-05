import { route } from '@/lib/server/http';
import { listPriceRequests } from '@/lib/server/catalog';

export const GET = (req: Request) => route(req, c => listPriceRequests(c, new URL(req.url).searchParams.get('status') ?? undefined));
