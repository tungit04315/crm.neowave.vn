// Firestore giả trong bộ nhớ, CHỈ dùng cho kiểm thử logic giao dịch phía máy chủ (không phải thay thế Emulator).
// Mô phỏng: collection/doc/subcollection, where (== , array-contains), orderBy(ID hoặc trường), limit, startAfter, count(), getAll, transaction.
// Giữ đúng hai ràng buộc quan trọng của Firestore thật: giao dịch phải ĐỌC hết trước khi GHI; `create` lỗi nếu tài liệu đã tồn tại.
import { Timestamp, type DocumentData } from 'firebase-admin/firestore';

type Filter = { field: string; op: '==' | 'array-contains'; value: unknown };
type Sentinel = { methodName: string; operand?: number };
const isSentinel = (v: unknown): v is Sentinel => !!v && typeof v === 'object' && 'methodName' in v;
const idOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);
const sortKey = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : (v as number | string));

export class FakeDb {
  data = new Map<string, DocumentData>();
  private clock = 0;
  private auto = 0;
  now() { return Timestamp.fromMillis(1_700_000_000_000 + this.clock++); }
  newId() { return `auto${String(++this.auto).padStart(4, '0')}`; }
  collection(path: string) { return new FakeQuery(this, path); }
  doc(path: string) { return new FakeDoc(this, path); }
  getAll(...refs: FakeDoc[]) { return Promise.all(refs.map(r => r.get())); }
  async runTransaction<T>(fn: (tx: FakeTx) => Promise<T>): Promise<T> {
    const tx = new FakeTx(this), out = await fn(tx);
    tx.commit();
    return out;
  }
  resolve(incoming: DocumentData, existing: DocumentData = {}): DocumentData {
    const out: DocumentData = {};
    for (const [k, v] of Object.entries(incoming)) {
      if (!isSentinel(v)) out[k] = v;
      else if (v.methodName === 'FieldValue.serverTimestamp') out[k] = this.now();
      else if (v.methodName === 'FieldValue.increment') out[k] = ((existing[k] as number | undefined) ?? 0) + (v.operand ?? 0);
      else throw new Error(`Sentinel chưa hỗ trợ: ${v.methodName}`);
    }
    return out;
  }
  /** Tài liệu con trực tiếp của một collection */
  docsIn(path: string) {
    const prefix = path + '/';
    return [...this.data.keys()].filter(k => k.startsWith(prefix) && !k.slice(prefix.length).includes('/')).sort();
  }
}

export class FakeDoc {
  constructor(public db: FakeDb, public path: string) {}
  get id() { return idOf(this.path); }
  collection(name: string) { return new FakeQuery(this.db, `${this.path}/${name}`); }
  async get() { const d = this.db.data.get(this.path); return { id: this.id, ref: this, exists: !!d, data: () => (d ? { ...d } : undefined) }; }
}

export class FakeQuery {
  constructor(public db: FakeDb, public path: string, private filters: Filter[] = [], private order: { field: unknown; dir: 'asc' | 'desc' } | null = null, private lim: number | null = null, private after: string | null = null) {}
  private with(p: Partial<{ filters: Filter[]; order: { field: unknown; dir: 'asc' | 'desc' }; lim: number; after: string }>) {
    return new FakeQuery(this.db, this.path, p.filters ?? this.filters, p.order ?? this.order, p.lim ?? this.lim, p.after ?? this.after);
  }
  doc(id?: string) { return new FakeDoc(this.db, `${this.path}/${id ?? this.db.newId()}`); }
  where(field: string, op: '==' | 'array-contains', value: unknown) { return this.with({ filters: [...this.filters, { field, op, value }] }); }
  orderBy(field: unknown, dir: 'asc' | 'desc' = 'asc') { return this.with({ order: { field, dir } }); }
  limit(n: number) { return this.with({ lim: n }); }
  startAfter(id: string) { return this.with({ after: id }); }
  private run() {
    let rows = this.db.docsIn(this.path).map(p => ({ id: idOf(p), ref: new FakeDoc(this.db, p), d: this.db.data.get(p)! }));
    for (const f of this.filters) rows = rows.filter(r => (f.op === '==' ? r.d[f.field] === f.value : Array.isArray(r.d[f.field]) && (r.d[f.field] as unknown[]).includes(f.value)));
    const byName = !this.order || typeof this.order.field !== 'string', dir = this.order?.dir === 'desc' ? -1 : 1;
    rows.sort((a, b) => { const x = byName ? a.id : sortKey(a.d[this.order!.field as string]), y = byName ? b.id : sortKey(b.d[this.order!.field as string]); return (x < y ? -1 : x > y ? 1 : 0) * dir; });
    if (this.after !== null) { const after = this.after; rows = rows.filter(r => (dir === 1 ? r.id > after : r.id < after)); }
    return this.lim === null ? rows : rows.slice(0, this.lim);
  }
  async get() {
    const docs = this.run().map(r => ({ id: r.id, ref: r.ref, exists: true, data: () => ({ ...r.d }) }));
    return { docs, size: docs.length, empty: docs.length === 0 };
  }
  count() { return { get: async () => ({ data: () => ({ count: this.run().length }) }) }; }
}

type Op = { kind: 'set' | 'create' | 'update' | 'delete'; ref: FakeDoc; data?: DocumentData };
export class FakeTx {
  private ops: Op[] = [];
  constructor(private db: FakeDb) {}
  private guard() { if (this.ops.length) throw new Error('Firestore transactions require all reads to be executed before all writes.'); }
  get(x: FakeDoc): ReturnType<FakeDoc['get']>;
  get(x: FakeQuery): ReturnType<FakeQuery['get']>;
  get(x: FakeDoc | FakeQuery) { this.guard(); return x instanceof FakeDoc ? x.get() : x.get(); }
  set(ref: FakeDoc, data: DocumentData) { this.ops.push({ kind: 'set', ref, data }); return this; }
  create(ref: FakeDoc, data: DocumentData) { this.ops.push({ kind: 'create', ref, data }); return this; }
  update(ref: FakeDoc, data: DocumentData) { this.ops.push({ kind: 'update', ref, data }); return this; }
  delete(ref: FakeDoc) { this.ops.push({ kind: 'delete', ref }); return this; }
  commit() {
    const view = new Map(this.db.data); // kiểm tra trên bản sao: có lỗi thì không ghi gì (nguyên tử)
    for (const o of this.ops) {
      const p = o.ref.path, cur = view.get(p);
      if (o.kind === 'create') { if (cur) throw new Error(`ALREADY_EXISTS: ${p}`); view.set(p, this.db.resolve(o.data!)); }
      else if (o.kind === 'set') view.set(p, this.db.resolve(o.data!));
      else if (o.kind === 'update') { if (!cur) throw new Error(`NOT_FOUND: ${p}`); view.set(p, { ...cur, ...this.db.resolve(o.data!, cur) }); }
      else view.delete(p);
    }
    this.db.data = view;
  }
}
