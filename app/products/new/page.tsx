import ItemForm from '@/components/catalog/ItemForm';

export default async function NewItem({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams, t = type === 'service' ? 'service' : 'product';
  return <div className="space-y-4"><h1 className="text-2xl font-bold text-slate-900">{t === 'product' ? 'Thêm sản phẩm' : 'Thêm dịch vụ'}</h1><ItemForm type={t} /></div>;
}
