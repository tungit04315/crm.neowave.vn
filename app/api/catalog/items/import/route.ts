import { readJson, route } from '@/lib/server/http';
import { importItems } from '@/lib/server/catalog';

export const POST = (req: Request) => route(req, async c => importItems(c, await readJson(req)));
