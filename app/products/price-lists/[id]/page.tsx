'use client';
import { useParams } from 'next/navigation';
import PriceListDetail from '@/components/pricelist/PriceListDetail';

export default function Page() { const { id } = useParams<{ id: string }>(); return <PriceListDetail id={id} />; }
