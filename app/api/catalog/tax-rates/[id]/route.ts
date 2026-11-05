import { readJson, route } from '@/lib/server/http';
import { updateTaxRate } from '@/lib/server/catalog';

type P = { params: Promise<{ id: string }> };
export const PATCH = (req: Request, { params }: P) => route(req, async c => updateTaxRate(c, (await params).id, await readJson(req)));
