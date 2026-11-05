import { route } from '@/lib/server/http';
import { listGroupPriceHistory } from '@/lib/server/pricing';

type P = { params: Promise<{ id: string }> };
export const GET = (req: Request, { params }: P) => route(req, async c => listGroupPriceHistory(c, (await params).id));
