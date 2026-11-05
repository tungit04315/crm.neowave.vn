import { readJson, route } from '@/lib/server/http';
import { setPolicyStatus } from '@/lib/server/discounts';

type P = { params: Promise<{ id: string }> };
export const POST = (req: Request, { params }: P) => route(req, async c => setPolicyStatus(c, (await params).id, await readJson(req)));
