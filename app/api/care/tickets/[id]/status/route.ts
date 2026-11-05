import { readJson, route } from '@/lib/server/http';
import { changeStatus } from '@/lib/server/care';

export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async c => changeStatus(c, (await params).id, await readJson(req)));
