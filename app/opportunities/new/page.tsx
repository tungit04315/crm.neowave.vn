import OpportunityForm from '@/components/opportunities/OpportunityForm';

export default async function NewOpportunity({ searchParams }: { searchParams: Promise<{ customerId?: string }> }) {
  const { customerId } = await searchParams;
  return <div className="space-y-4"><h1 className="text-2xl font-bold text-slate-900">Tạo cơ hội bán hàng</h1><OpportunityForm defaultCustomerId={customerId} /></div>;
}
