"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, getErrorMessage, type Project } from "@/lib/api-client";

type ProjectContextValue = {
  projects: Project[];
  projectId: string;
  setProjectId: (id: string) => void;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const ProjectContext = createContext<ProjectContextValue | null>(null);

const STORAGE_KEY = "factory.projectId";

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectIdState] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const list = await api.projects.list();
      setProjects(list);
      const stored =
        typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      const nextId =
        list.find((p) => p.id === stored)?.id ?? list[0]?.id ?? "";
      setProjectIdState(nextId);
      if (nextId && typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, nextId);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setProjectId = useCallback((id: string) => {
    setProjectIdState(id);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, id);
    }
  }, []);

  const value = useMemo(
    () => ({ projects, projectId, setProjectId, loading, error, refresh }),
    [projects, projectId, setProjectId, loading, error, refresh],
  );

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
};

export const useProject = () => {
  const ctx = useContext(ProjectContext);
  if (!ctx) {
    throw new Error("useProject must be used within ProjectProvider");
  }
  return ctx;
};
