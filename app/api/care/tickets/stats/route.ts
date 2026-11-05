import { route } from '@/lib/server/http';
import { ticketStats } from '@/lib/server/care';

export const GET = (req: Request) => route(req, c => ticketStats(c, new URL(req.url).searchParams));
