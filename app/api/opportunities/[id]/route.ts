import { readJson, route } from '@/lib/server/http';
import { getOpportunity, removeOpportunity, updateOpportunity } from '@/lib/server/opportunities';

type P = { params: Promise<{ id: string }> };
export const GET = (req: Request, { params }: P) => route(req, async c => getOpportunity(c, (await params).id));
export const PATCH = (req: Request, { params }: P) => route(req, async c => updateOpportunity(c, (await params).id, await readJson(req)));
export const DELETE = (req: Request, { params }: P) => route(req, async c => removeOpportunity(c, (await params).id));
