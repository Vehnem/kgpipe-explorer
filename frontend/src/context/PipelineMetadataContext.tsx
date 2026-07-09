import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import type { PipelineMetadataMap } from "../api";
import { fetchPipelineMetadata } from "../api";

type PipelineMetadataContextValue = {
  metadata: PipelineMetadataMap;
  loading: boolean;
  error: string;
};

const PipelineMetadataContext = createContext<PipelineMetadataContextValue>({
  metadata: {},
  loading: false,
  error: ""
});

export type PipelineMetadataProviderProps = {
  runId?: string;
  children: ReactNode;
};

export function PipelineMetadataProvider({ runId, children }: PipelineMetadataProviderProps) {
  const [metadata, setMetadata] = useState<PipelineMetadataMap>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!runId) {
      setMetadata({});
      setLoading(false);
      setError("");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    fetchPipelineMetadata(runId)
      .then((next) => {
        if (!cancelled) {
          setMetadata(next);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setMetadata({});
          setError(err instanceof Error ? err.message : "Failed to load pipeline metadata");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [runId]);

  const value = useMemo(
    () => ({
      metadata,
      loading,
      error
    }),
    [metadata, loading, error]
  );

  return (
    <PipelineMetadataContext.Provider value={value}>{children}</PipelineMetadataContext.Provider>
  );
}

export function usePipelineMetadataMap() {
  return useContext(PipelineMetadataContext);
}

export function usePipelineMetadata(pipelineId: string) {
  const { metadata } = usePipelineMetadataMap();
  return metadata[pipelineId] ?? null;
}

export function formatPipelineMetadataTooltip(metadata: PipelineMetadataMap[string]): string {
  const stepSummary = metadata.steps
    .map((step) => `${step.step_number}. ${step.task_name}`)
    .join(" → ");
  return `${metadata.description}\n${stepSummary}\n${metadata.uri}`;
}
