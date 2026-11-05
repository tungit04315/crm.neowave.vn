import { readJson, route } from '@/lib/server/http';
import { deleteCategory, updateCategory } from '@/lib/server/catalog';

type P = { params: Promise<{ id: string }> };
export const PATCH = (req: Request, { params }: P) => route(req, async c => updateCategory(c, (await params).id, await readJson(req)));
export const DELETE = (req: Request, { params }: P) => route(req, async c => deleteCategory(c, (await params).id));
