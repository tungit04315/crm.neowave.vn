'use client';
import { useParams } from 'next/navigation';
import DiscountDetail from '@/components/pricing/DiscountDetail';
export default function Page() { const { id } = useParams<{ id: string }>(); return <DiscountDetail id={id} />; }
