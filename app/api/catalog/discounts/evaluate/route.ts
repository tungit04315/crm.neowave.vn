import { readJson, route } from '@/lib/server/http';
import { evaluate } from '@/lib/server/discounts';

export const POST = (req: Request) => route(req, async c => evaluate(c, await readJson(req)));
