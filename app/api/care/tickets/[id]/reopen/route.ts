import { readJson, route } from '@/lib/server/http';
import { reopenTicket } from '@/lib/server/care';

export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async c => reopenTicket(c, (await params).id, await readJson(req)));
