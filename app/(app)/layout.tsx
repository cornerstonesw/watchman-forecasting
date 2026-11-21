import { Suspense } from "react";
import AppShell from "@/components/AppShell";
import { WorkspaceProvider } from "@/components/Workspace";
import SessionGuard from "@/components/SessionGuard";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <WorkspaceProvider>
        <AppShell>{children}</AppShell>
        <SessionGuard />
      </WorkspaceProvider>
    </Suspense>
  );
}
