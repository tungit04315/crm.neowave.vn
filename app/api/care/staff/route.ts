import { route } from '@/lib/server/http';
import { listStaff } from '@/lib/server/care';

export const GET = (req: Request) => route(req, c => listStaff(c, new URL(req.url).searchParams));
