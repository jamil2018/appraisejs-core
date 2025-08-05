import Logo from "@/components/logo";
import NavLink from "@/components/navigation/nav-link";
import {
  Blocks,
  BookOpenCheck,
  Code,
  LayoutDashboard,
  LayoutTemplate,
  ScanEye,
  Settings,
  TestTubeDiagonal,
  TestTubes,
  Users,
} from "lucide-react";
import Link from "next/link";

export default function BaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto lg:max-w-screen-xl 2xl:max-w-screen-2xl">
      <nav className="py-2 mb-6">
        <div className="flex items-center gap-1">
          <div className="-ml-2">
            <Link href="/dashboard">
              <Logo />
            </Link>
          </div>
          <NavLink
            href="/dashboard"
            icon={<LayoutDashboard className="w-4 h-4 text-primary" />}
          >
            Dashboard
          </NavLink>
          <NavLink
            href="/test-suites"
            icon={<TestTubes className="w-4 h-4 text-primary" />}
          >
            Test Suites
          </NavLink>
          <NavLink
            href="/test-cases"
            icon={<TestTubeDiagonal className="w-4 h-4 text-primary" />}
          >
            Test Cases
          </NavLink>
          <NavLink
            href="/test-runs"
            icon={<BookOpenCheck className="w-4 h-4 text-primary" />}
          >
            Test Runs
          </NavLink>
          <NavLink
            href="/users"
            icon={<Users className="w-4 h-4 text-primary" />}
          >
            Users
          </NavLink>
          <NavLink
            href="/reviews"
            icon={<ScanEye className="w-4 h-4 text-primary" />}
          >
            Reviews
          </NavLink>
          <NavLink
            href="/settings"
            icon={<Settings className="w-4 h-4 text-primary" />}
          >
            Settings
          </NavLink>
          <NavLink
            href="/template-steps"
            icon={<LayoutTemplate className="w-4 h-4 text-primary" />}
          >
            Template Steps
          </NavLink>
          <NavLink
            href="/locators"
            icon={<Code className="w-4 h-4 text-primary" />}
          >
            Locators
          </NavLink>
          <NavLink
            href="/template-test-cases"
            icon={<Blocks className="w-4 h-4 text-primary" />}
          >
            Template Test Cases
          </NavLink>
        </div>
      </nav>
      {children}
    </div>
  );
}
