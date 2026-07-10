import { AppShell } from "@/components/app-shell";
import { ProjectProvider } from "@/lib/project-context";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ProjectProvider>
      <AppShell>{children}</AppShell>
    </ProjectProvider>
  );
}
