import { readJson, route } from '@/lib/server/http';
import { updateGroupPrice } from '@/lib/server/pricing';

type P = { params: Promise<{ id: string }> };
export const PATCH = (req: Request, { params }: P) => route(req, async c => updateGroupPrice(c, (await params).id, await readJson(req)));
