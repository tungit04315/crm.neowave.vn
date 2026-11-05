import { readJson, route } from '@/lib/server/http';
import { getTicket, updateTicket } from '@/lib/server/care';

type P = { params: Promise<{ id: string }> };
export const GET = (req: Request, { params }: P) => route(req, async c => getTicket(c, (await params).id));
export const PATCH = (req: Request, { params }: P) => route(req, async c => updateTicket(c, (await params).id, await readJson(req)));
