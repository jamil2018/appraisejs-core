import Logo from "@/components/logo";
import NavLink from "@/components/navigation/nav-link";
import {
  Blocks,
  BookOpenCheck,
  Bot,
  BrickWall,
  Code,
  FileSliders,
  LayoutDashboard,
  LayoutTemplate,
  Puzzle,
  ScanEye,
  Settings,
  TestTubeDiagonal,
  TestTubes,
  Users,
  UsersRound,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import NavMenuCardDeck from "@/components/navigation/nav-menu-card-deck";

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
            icon={<LayoutDashboard className="w-5 h-5 text-primary" />}
          >
            Dashboard
          </NavLink>
          <NavMenuCardDeck
            containerButtonText="Automate"
            containerButtonIcon={<Bot className="w-5 h-5 text-primary" />}
            dropdownItems={[
              {
                text: "Test Suites",
                icon: <TestTubes className="w-6 h-6 text-primary" />,
                href: "/test-suites",
                description: "Create, modify, and run test suites",
              },
              {
                text: "Test Cases",
                icon: <TestTubeDiagonal className="w-6 h-6 text-primary" />,
                href: "/test-cases",
                description: "Create, modify, and run test cases",
              },
              {
                text: "Test Runs",
                icon: <BookOpenCheck className="w-6 h-6 text-primary" />,
                href: "/test-runs",
                description: "View test runs",
              },
            ]}
          />
          <NavMenuCardDeck
            containerButtonText="Template"
            containerButtonIcon={<BrickWall className="w-5 h-5 text-primary" />}
            dropdownItems={[
              {
                text: "Template Steps",
                icon: <LayoutTemplate className="w-6 h-6 text-primary" />,
                href: "/template-steps",
                description: "Create, modify, and run template steps",
              },
              {
                text: "Template Test Cases",
                icon: <Blocks className="w-6 h-6 text-primary" />,
                href: "/template-test-cases",
                description: "Create, modify, and run template test cases",
              },
            ]}
          />
          <NavMenuCardDeck
            containerButtonText="Configuration"
            containerButtonIcon={
              <FileSliders className="w-5 h-5 text-primary" />
            }
            dropdownItems={[
              {
                text: "Locators",
                icon: <Code className="w-6 h-6 text-primary" />,
                href: "/locators",
                description: "Create, modify, and run locators",
              },
              {
                text: "Modules",
                icon: <Puzzle className="w-6 h-6 text-primary" />,
                href: "/modules",
                description: "Create, modify, and run modules",
              },
            ]}
          />
          <NavMenuCardDeck
            containerButtonText="Team"
            containerButtonIcon={
              <UsersRound className="w-5 h-5 text-primary" />
            }
            dropdownItems={[
              {
                text: "Reviews",
                icon: <ScanEye className="w-6 h-6 text-primary" />,
                href: "/reviews",
                description: "Create, modify, and run reviews",
              },
            ]}
          />
          <NavMenuCardDeck
            containerButtonText="Manage"
            containerButtonIcon={<Wrench className="w-5 h-5 text-primary" />}
            dropdownItems={[
              {
                text: "Settings",
                icon: <Settings className="w-6 h-6 text-primary" />,
                href: "/settings",
                description: "Create, modify, and run settings",
              },
              {
                text: "Users",
                icon: <Users className="w-6 h-6 text-primary" />,
                href: "/users",
                description: "Create, modify, and run users",
              },
            ]}
          />
        </div>
      </nav>
      {children}
    </div>
  );
}
