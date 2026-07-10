"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const STORY_TABS = [
  { suffix: "", label: "Overview" },
  { suffix: "/graph", label: "Graph" },
  { suffix: "/generate", label: "Generate" },
] as const;

export const StoryNav = ({ storyId }: { storyId: string }) => {
  const pathname = usePathname();
  const base = `/library/${storyId}`;

  return (
    <nav
      aria-label="Story sections"
      className="flex flex-wrap gap-1 border-b border-gray-200 pb-3"
    >
      {STORY_TABS.map((tab) => {
        const href = `${base}${tab.suffix}`;
        const active = pathname === href;
        return (
          <Link
            key={tab.label}
            href={href}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              active
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
            aria-current={active ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
};
