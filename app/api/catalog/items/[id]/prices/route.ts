import { route } from '@/lib/server/http';
import { getItemPrices } from '@/lib/server/pricing';

type P = { params: Promise<{ id: string }> };
export const GET = (req: Request, { params }: P) => route(req, async c => getItemPrices(c, (await params).id));
