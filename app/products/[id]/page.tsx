'use client';
import { useParams } from 'next/navigation';
import ItemDetail from '@/components/catalog/ItemDetail';

export default function Page() { const { id } = useParams<{ id: string }>(); return <ItemDetail id={id} />; }
