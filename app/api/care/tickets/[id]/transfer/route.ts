import { readJson, route } from '@/lib/server/http';
import { transferTicket } from '@/lib/server/care';

export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async c => transferTicket(c, (await params).id, await readJson(req)));
