import { readJson, route } from '@/lib/server/http';
import { closeOpportunity } from '@/lib/server/opportunities';

export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async c => closeOpportunity(c, (await params).id, await readJson(req)));
