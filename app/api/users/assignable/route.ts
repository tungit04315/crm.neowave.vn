import { route } from '@/lib/server/http';
import { listAssignable } from '@/lib/server/opportunities';

export const GET = (req: Request) => route(req, c => listAssignable(c));
