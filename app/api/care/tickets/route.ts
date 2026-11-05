import { readJson, route } from '@/lib/server/http';
import { createTicket, listTickets } from '@/lib/server/care';

export const GET = (req: Request) => route(req, c => listTickets(c, new URL(req.url).searchParams));
export const POST = (req: Request) => route(req, async c => createTicket(c, await readJson(req)));
