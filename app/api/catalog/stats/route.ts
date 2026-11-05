import { route } from '@/lib/server/http';
import { catalogStats } from '@/lib/server/catalog';

export const GET = (req: Request) => route(req, c => catalogStats(c));
