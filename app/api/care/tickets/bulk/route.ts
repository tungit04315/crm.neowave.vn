import { readJson, route } from '@/lib/server/http';
import { bulkTickets } from '@/lib/server/care';

export const POST = (req: Request) => route(req, async c => bulkTickets(c, await readJson(req)));
