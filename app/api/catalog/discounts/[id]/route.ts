import { readJson, route } from '@/lib/server/http';
import { getPolicy, updatePolicy } from '@/lib/server/discounts';

type P = { params: Promise<{ id: string }> };
export const GET = (req: Request, { params }: P) => route(req, async c => getPolicy(c, (await params).id));
export const PATCH = (req: Request, { params }: P) => route(req, async c => updatePolicy(c, (await params).id, await readJson(req)));
