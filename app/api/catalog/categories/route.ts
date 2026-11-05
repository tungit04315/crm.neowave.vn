import { readJson, route } from '@/lib/server/http';
import { createCategory, listCategories } from '@/lib/server/catalog';

export const GET = (req: Request) => route(req, c => listCategories(c, new URL(req.url).searchParams.get('type') ?? undefined));
export const POST = (req: Request) => route(req, async c => createCategory(c, await readJson(req)));
