import { route } from '@/lib/server/http';
import { exportTickets } from '@/lib/server/care';

export const GET = (req: Request) => route(req, c => exportTickets(c, new URL(req.url).searchParams));
