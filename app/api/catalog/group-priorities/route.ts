import { readJson, route } from '@/lib/server/http';
import { listGroupPriorities, setGroupPriority } from '@/lib/server/pricing';

export const GET = (req: Request) => route(req, c => listGroupPriorities(c));
export const PUT = (req: Request) => route(req, async c => setGroupPriority(c, await readJson(req)));
