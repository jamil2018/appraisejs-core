import Logo from "@/components/logo";
import NavLink from "@/components/navigation/nav-link";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import Link from "next/link";

export default function BaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto lg:max-w-screen-xl 2xl:max-w-screen-2xl">
      <nav className="py-2 mb-6">
        <NavigationMenu>
          <NavigationMenuList className="flex items-center">
            <NavigationMenuItem className="-ml-2">
              <Link href="/dashboard">
                <Logo />
              </Link>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavLink href="/dashboard">Dashboard</NavLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavLink href="/test-suites">Test Suites</NavLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavLink href="/test-cases">Test Cases</NavLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavLink href="/test-runs">Test Runs</NavLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavLink href="/users">Users</NavLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavLink href="/reviews">Reviews</NavLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavLink href="/settings">Settings</NavLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavLink href="/template-steps">Template Steps</NavLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavLink href="/locators">Locators</NavLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavLink href="/template-test-cases">Template Test Cases</NavLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
      </nav>
      {children}
    </div>
  );
}
