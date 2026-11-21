"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { overview, whoami, type Dataset, type Snapshot, type Who } from "@/lib/data";

// Who's signed in, which dataset, its snapshots, and the two being compared.
// The comparison lives in the URL (?base=…&curr=…) so a view can be shared.

type Ctx = {
  who: Who | null;
  dataset: Dataset | null;
  snapshots: Snapshot[];
  base: Snapshot | null;
  curr: Snapshot | null;
  setPair: (base: number, curr: number) => void;
  reload: () => Promise<void>;
  loading: boolean;
  canImport: boolean;
  isAdmin: boolean;
};

const WorkspaceContext = createContext<Ctx | null>(null);
export const useWorkspace = () => {
  const c = useContext(WorkspaceContext);
  if (!c) throw new Error("useWorkspace outside provider");
  return c;
};

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const params = useSearchParams();
  const [who, setWho] = useState<Who | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const w = await whoami();
    setWho(w);
    const ds = w.datasets[0];
    setSnapshots(ds ? await overview(ds.id) : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload().catch(() => setLoading(false));
  }, [reload]);

  const byId = (id: string | null) => snapshots.find((s) => String(s.id) === id) ?? null;
  const curr = byId(params.get("curr")) ?? snapshots.at(-1) ?? null;
  const base =
    byId(params.get("base")) ??
    (curr ? [...snapshots].reverse().find((s) => s.as_of < curr.as_of) ?? null : null) ??
    null;

  const setPair = useCallback(
    (b: number, c: number) => {
      const sp = new URLSearchParams(params.toString());
      sp.set("base", String(b));
      sp.set("curr", String(c));
      router.replace(`?${sp.toString()}`, { scroll: false });
    },
    [params, router]
  );

  const role = who?.member?.role;
  const value = useMemo<Ctx>(
    () => ({
      who, dataset: who?.datasets[0] ?? null, snapshots, base, curr, setPair, reload, loading,
      canImport: role === "admin" || role === "manager", isAdmin: role === "admin",
    }),
    [who, snapshots, base, curr, setPair, reload, loading, role]
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
