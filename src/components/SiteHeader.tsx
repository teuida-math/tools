import Link from 'next/link';

interface SiteHeaderProps {
  title: string;
}

export default function SiteHeader({ title }: SiteHeaderProps) {
  return (
    <header className="border-b border-navy/15 bg-paper">
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-4 md:py-5 flex items-center gap-3">
        <Link
          href="/"
          className="text-orange font-bold text-xl tracking-tight hover:text-orange/80 transition-colors"
        >
          트이다
        </Link>
        <span className="text-navy/20 text-xl">|</span>
        <span className="text-muted text-sm font-medium">{title}</span>
      </div>
    </header>
  );
}
