"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProject } from "@/lib/project-context";
import { Select } from "@/components/ui";

const NAV_ITEMS = [
  { href: "/discovery", label: "Viral Feed" },
  { href: "/library", label: "Library" },
  { href: "/jobs", label: "Jobs" },
  { href: "/analytics", label: "Analytics" },
] as const;

export const AppShell = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();
  const { projects, projectId, setProjectId, loading, error } = useProject();

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="text-sm font-semibold tracking-tight">
              AI Content Factory
            </span>
            <nav aria-label="Main" className="flex flex-wrap gap-1">
              {NAV_ITEMS.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                      active
                        ? "bg-gray-900 text-white"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    }`}
                    aria-current={active ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="min-w-[12rem]">
            <label className="sr-only" htmlFor="project-select">
              Project
            </label>
            <Select
              id="project-select"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              disabled={loading || projects.length === 0}
              aria-label="Select project"
            >
              {projects.length === 0 ? (
                <option value="">No projects</option>
              ) : (
                projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))
              )}
            </Select>
          </div>
        </div>
        {error ? (
          <p className="mx-auto max-w-6xl px-4 pb-2 text-sm text-red-600">
            {error}
          </p>
        ) : null}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
};
