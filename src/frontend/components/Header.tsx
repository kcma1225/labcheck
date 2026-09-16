import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function BrandLink({ className = "text-2xl" }: { className?: string }) {
  return (
    <Link to="/" className={`shrink-0 font-semibold tracking-tight text-gray-900 hover:opacity-80 ${className}`}>
      labCheck<span aria-hidden="true" className="text-green-700">.</span>
    </Link>
  );
}

export function Header({ end, className = "" }: { end?: ReactNode; className?: string }) {
  return (
    <header className={`flex h-[4.25rem] min-w-0 shrink-0 items-center justify-between gap-4 border-b border-gray-200 px-4 py-3 sm:h-[5.25rem] sm:py-5 ${className}`}>
      <BrandLink />
      {end}
    </header>
  );
}
