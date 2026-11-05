import { route } from '@/lib/server/http';
import { exportOpportunities } from '@/lib/server/opportunities';

export const GET = (req: Request) => route(req, c => exportOpportunities(c));
