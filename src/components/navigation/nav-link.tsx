"use client";

import { usePathname } from "next/navigation";
import {
  NavigationMenuLink,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import Link from "next/link";

const NavLink = ({
  children,
  href,
  icon,
}: {
  children: React.ReactNode;
  href: string;
  icon?: React.ReactNode;
}) => {
  const pathname = usePathname();
  return (
    <NavigationMenuLink
      className={navigationMenuTriggerStyle()}
      active={pathname === href}
      asChild
    >
      <Link href={href}>
        <div className="flex items-center gap-1">
          {icon}
          {children}
        </div>
      </Link>
    </NavigationMenuLink>
  );
};

export default NavLink;
