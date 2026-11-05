import { readJson, route } from '@/lib/server/http';
import { decidePriceRequest } from '@/lib/server/catalog';

type P = { params: Promise<{ id: string }> };
export const POST = (req: Request, { params }: P) => route(req, async c => decidePriceRequest(c, (await params).id, await readJson(req)));
