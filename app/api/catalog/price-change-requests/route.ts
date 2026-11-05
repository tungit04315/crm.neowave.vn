import { readJson, route } from '@/lib/server/http';
import { listChangeRequests, requestChange } from '@/lib/server/change-requests';

export const GET = (req: Request) => route(req, c => listChangeRequests(c, new URL(req.url).searchParams.get('status') ?? undefined));
export const POST = (req: Request) => route(req, async c => requestChange(c, await readJson(req)));
