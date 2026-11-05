import ItemList from '@/components/catalog/ItemList';

export default async function Page({ searchParams }: { searchParams: Promise<{ categoryId?: string }> }) {
  const { categoryId } = await searchParams;
  return <ItemList initialCategoryId={categoryId} />;
}
