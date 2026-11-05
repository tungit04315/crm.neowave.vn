import { route } from '@/lib/server/http';
import { listPolicyHistory } from '@/lib/server/discounts';

type P = { params: Promise<{ id: string }> };
export const GET = (req: Request, { params }: P) => route(req, async c => listPolicyHistory(c, (await params).id));
