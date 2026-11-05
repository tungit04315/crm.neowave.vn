import { readJson, route } from '@/lib/server/http';
import { getStages, putStages } from '@/lib/server/pipeline';

export const GET = (req: Request) => route(req, c => getStages(c));
export const PUT = (req: Request) => route(req, async c => putStages(c, await readJson(req)));
