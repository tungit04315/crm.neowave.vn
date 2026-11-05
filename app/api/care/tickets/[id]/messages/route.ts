import { readJson, route } from '@/lib/server/http';
import { addMessage } from '@/lib/server/care';

export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async c => addMessage(c, (await params).id, await readJson(req)));
