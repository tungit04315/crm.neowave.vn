import { readJson, route } from '@/lib/server/http';
import { createItem, listItems } from '@/lib/server/catalog';

export const GET = (req: Request) => route(req, c => listItems(c, Object.fromEntries(new URL(req.url).searchParams)));
export const POST = (req: Request) => route(req, async c => createItem(c, await readJson(req)));
