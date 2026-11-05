import { readJson, route } from '@/lib/server/http';
import { getItem, updateItem } from '@/lib/server/catalog';

type P = { params: Promise<{ id: string }> };
export const GET = (req: Request, { params }: P) => route(req, async c => getItem(c, (await params).id));
export const PATCH = (req: Request, { params }: P) => route(req, async c => updateItem(c, (await params).id, await readJson(req)));
