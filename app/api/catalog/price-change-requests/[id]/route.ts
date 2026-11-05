import { readJson, route } from '@/lib/server/http';
import { decideChange } from '@/lib/server/change-requests';

type P = { params: Promise<{ id: string }> };
export const POST = (req: Request, { params }: P) => route(req, async c => decideChange(c, (await params).id, await readJson(req)));
