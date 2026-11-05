import { route } from '@/lib/server/http';
import { claimTicket } from '@/lib/server/care';

export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async c => claimTicket(c, (await params).id));
