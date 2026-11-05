import { route } from '@/lib/server/http';
import { reopenOpportunity } from '@/lib/server/opportunities';

export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async c => reopenOpportunity(c, (await params).id));
