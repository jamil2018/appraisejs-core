"use client";

import { usePathname, useRouter } from "next/navigation";
import React, { useState } from "react";
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
  const [isHovered, setIsHovered] = useState(false);

  const handleDropdownItemClick = (href: string) => {
    setIsHovered(false);
    router.push(href);
  };

  const checkIfTriggerActive = (href: string) => {
    return dropdownItems.some(
      (item) => item.href === href || pathname.startsWith(item.href)
    );
  };

  const checkIfItemActive = (href: string) => {
    return href === pathname || pathname.startsWith(href);
  };

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        type="button"
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
            isHovered && "-rotate-180"
          )}
        />
      </button>

      {isHovered && (
        <div className="absolute top-full left-0 w-full h-1 bg-transparent" />
      )}

      {isHovered && (
        <div className="absolute top-full left-0 z-50 mt-1 bg-popover border rounded-md shadow-md p-1">
          <div
            className={cn(
              "grid gap-0.5",
              dropdownItems.length === 1
                ? "grid-cols-1 w-[300px]"
                : "grid-cols-2 w-[600px]"
            )}
          >
            {dropdownItems.map((item) => (
              <div
                key={item.href}
                className="transition-colors hover:cursor-pointer"
                onClick={() => handleDropdownItemClick(item.href)}
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
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default NavMenuCardDeck;
