import { readJson, route } from '@/lib/server/http';
import { createOpportunity, listOpportunities } from '@/lib/server/opportunities';

export const GET = (req: Request) => route(req, c => listOpportunities(c, new URL(req.url).searchParams.get('customerId') ?? undefined));
export const POST = (req: Request) => route(req, async c => createOpportunity(c, await readJson(req)));
