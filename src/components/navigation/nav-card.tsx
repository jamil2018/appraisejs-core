import React from "react";
import { Card, CardContent } from "../ui/card";
import Link from "next/link";

const NavCard = ({
  data,
  href,
  icon,
}: {
  data: { title: string; description: string };
  href: string;
  icon: React.ReactNode;
}) => {
  return (
    <Link href={href} className="w-full">
      <Card className="hover:bg-accent hover:text-accent-foreground transition-colors w-full h-24 outline-none border-none">
        <CardContent className="flex gap-3 p-4 w-full h-full items-center">
          <div className="flex items-center justify-center rounded-md text-accent-foreground w-12 h-12 flex-shrink-0">
            {icon}
          </div>
          <div className="flex flex-col justify-center min-w-0 flex-1">
            <span className="text-sm font-medium truncate">{data.title}</span>
            <span className="text-xs text-muted-foreground line-clamp-2">
              {data.description}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
};

export default NavCard;
