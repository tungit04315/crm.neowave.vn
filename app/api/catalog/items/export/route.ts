import { route } from '@/lib/server/http';
import { exportItems } from '@/lib/server/catalog';

export const GET = (req: Request) => route(req, c => exportItems(c, Object.fromEntries(new URL(req.url).searchParams)));
