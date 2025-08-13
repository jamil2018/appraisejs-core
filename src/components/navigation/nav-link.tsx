"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

const NavLink = ({
  children,
  href,
  icon,
  className,
  isIconOnly,
}: {
  children?: React.ReactNode;
  href: string;
  icon?: React.ReactNode;
  className?: React.HTMLAttributes<HTMLAnchorElement>["className"];
  isIconOnly?: boolean;
}) => {
  const pathname = usePathname();

  // Use useMemo to prevent unnecessary re-renders and ensure stable active state
  const isActive = useMemo(() => {
    // Exact match for root paths
    if (href === "/" && pathname === "/") {
      return true;
    }
    // For other paths, check if the current path starts with the href
    // This handles nested routes like /test-cases/create, /test-cases/modify, etc.
    return href !== "/" && pathname.startsWith(href);
  }, [pathname, href]);

  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex h-9 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        "focus:bg-accent focus:text-accent-foreground",
        "focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-1",
        "disabled:pointer-events-none disabled:opacity-50",
        "outline-none",
        isActive && "bg-accent text-accent-foreground",
        className
      )}
    >
      {isIconOnly ? (
        icon
      ) : (
        <div className="flex items-center gap-1">
          {icon}
          {children}
        </div>
      )}
    </Link>
  );
};

export default NavLink;
