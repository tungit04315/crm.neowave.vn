import { readJson, route } from '@/lib/server/http';
import { assignOpportunity } from '@/lib/server/opportunities';

export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async c => assignOpportunity(c, (await params).id, await readJson(req)));
