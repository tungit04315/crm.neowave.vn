import { readJson, route } from '@/lib/server/http';
import { createPolicy, listPolicies } from '@/lib/server/discounts';

export const GET = (req: Request) => route(req, c => listPolicies(c, Object.fromEntries(new URL(req.url).searchParams)));
export const POST = (req: Request) => route(req, async c => createPolicy(c, await readJson(req)));
