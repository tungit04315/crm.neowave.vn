import { Hexagon } from 'lucide-react';
export default function Brand({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const lg = size === 'lg';
  return (<div className="flex items-center gap-3">
    <Hexagon className="fill-blue-600 text-blue-600" size={lg ? 60 : 52} />
    <div className="leading-none"><div className={`${lg ? 'text-5xl' : 'text-4xl'} font-extrabold tracking-tight text-blue-700`}>CRM</div>
      <div className="mt-1 text-sm text-slate-600">Enterprise Solutions</div></div></div>);
}
