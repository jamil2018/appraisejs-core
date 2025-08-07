"use client";

import { usePathname, useRouter } from "next/navigation";
import React, { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "../ui/card";
import { ChevronDown } from "lucide-react";

const NavMenuCardDeck = ({
  containerButtonText,
  containerButtonIcon,
  dropdownItems,
}: {
  containerButtonText: string;
  containerButtonIcon: React.ReactNode;
  dropdownItems: {
    text: string;
    icon: React.ReactNode;
    href: string;
    description: string;
  }[];
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const handleDropdownItemClick = (href: string) => {
    setIsDropdownOpen(false);
    router.push(href);
  };
  const checkIfTriggerActive = (href: string) => {
    return dropdownItems.some((item) => item.href === href);
  };
  const checkIfItemActive = (href: string) => {
    return href === pathname;
  };
  return (
    <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
      <DropdownMenuTrigger
        className={cn(
          "flex items-center gap-2 outline-none transition-colors px-4 py-2 rounded-md",
          checkIfTriggerActive(pathname) && "bg-accent text-accent-foreground",
          "hover:bg-accent hover:text-accent-foreground"
        )}
      >
        {containerButtonIcon}
        <span className="text-sm font-medium">{containerButtonText}</span>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-muted-foreground transition-transform duration-200 ease-in-out",
            isDropdownOpen && "-rotate-180"
          )}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className={cn(
          "grid grid-cols-2 gap-0.5",
          dropdownItems.length === 1 && "grid-cols-1",
          dropdownItems.length > 1 && "w-[600px]"
        )}
        sideOffset={8}
      >
        {dropdownItems.map((item) => (
          <DropdownMenuItem
            key={item.href}
            className="hover:bg-transparent focus:bg-transparent p-0 transition-colors hover:cursor-pointer"
            onSelect={() => handleDropdownItemClick(item.href)}
          >
            <Card
              className={cn(
                "hover:bg-accent hover:text-accent-foreground transition-colors w-full h-24 outline-none border-none",
                checkIfItemActive(item.href) &&
                  "bg-accent text-accent-foreground",
                "hover:cursor-pointer"
              )}
            >
              <CardContent className="flex gap-3 p-4 w-full h-full items-center">
                <div className="flex items-center justify-center rounded-md text-accent-foreground w-12 h-12 flex-shrink-0">
                  {item.icon}
                </div>
                <div className="flex flex-col justify-center min-w-0 flex-1">
                  <span className="text-sm font-medium truncate">
                    {item.text}
                  </span>
                  <span className="text-xs text-muted-foreground line-clamp-2">
                    {item.description}
                  </span>
                </div>
              </CardContent>
            </Card>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NavMenuCardDeck;
