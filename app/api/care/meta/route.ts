import { route } from '@/lib/server/http';
import { careMeta } from '@/lib/server/care';

export const GET = (req: Request) => route(req, c => careMeta(c));
