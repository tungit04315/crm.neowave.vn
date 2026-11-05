import { readJson, route } from '@/lib/server/http';
import { moveStage } from '@/lib/server/pipeline';

export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async c => moveStage(c, (await params).id, await readJson(req)));
