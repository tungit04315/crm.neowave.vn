import { readJson, route } from '@/lib/server/http';
import { deleteUnit, updateUnit } from '@/lib/server/catalog';

type P = { params: Promise<{ id: string }> };
export const PATCH = (req: Request, { params }: P) => route(req, async c => updateUnit(c, (await params).id, await readJson(req)));
export const DELETE = (req: Request, { params }: P) => route(req, async c => deleteUnit(c, (await params).id));
