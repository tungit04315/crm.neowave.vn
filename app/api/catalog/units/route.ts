import { readJson, route } from '@/lib/server/http';
import { createUnit, listUnits } from '@/lib/server/catalog';

export const GET = (req: Request) => route(req, c => listUnits(c));
export const POST = (req: Request) => route(req, async c => createUnit(c, await readJson(req)));
