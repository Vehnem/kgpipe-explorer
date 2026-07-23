import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import type { MeasurementMetadataMap } from "../api";
import { fetchMeasurementMetadata } from "../api";

type MetricMetadataContextValue = {
  metadata: MeasurementMetadataMap;
  loading: boolean;
  error: string;
};

const MetricMetadataContext = createContext<MetricMetadataContextValue>({
  metadata: {},
  loading: false,
  error: ""
});

export type MetricMetadataProviderProps = {
  /** Optional metric column names / aliases to resolve. Omit to load full catalog. */
  ids?: string[];
  children: ReactNode;
};

export function MetricMetadataProvider({ ids, children }: MetricMetadataProviderProps) {
  const [metadata, setMetadata] = useState<MeasurementMetadataMap>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const idsKey = ids?.slice().sort().join(",") ?? "";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    fetchMeasurementMetadata(ids && ids.length > 0 ? ids : undefined)
      .then((next) => {
        if (!cancelled) {
          setMetadata(next);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setMetadata({});
          setError(err instanceof Error ? err.message : "Failed to load metric metadata");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  const value = useMemo(
    () => ({
      metadata,
      loading,
      error
    }),
    [metadata, loading, error]
  );

  return (
    <MetricMetadataContext.Provider value={value}>{children}</MetricMetadataContext.Provider>
  );
}

export function useMetricMetadataMap() {
  return useContext(MetricMetadataContext);
}

export function useMetricMetadata(metricKey: string) {
  const { metadata } = useMetricMetadataMap();
  return metadata[metricKey] ?? metadata[metricKey.toLowerCase()] ?? null;
}

export function formatMetricMetadataTooltip(
  metadata: MeasurementMetadataMap[string]
): string {
  const unit = metadata.unit ? ` (${metadata.unit})` : "";
  const aliases =
    metadata.alias.length > 0 ? `\nAliases: ${metadata.alias.join(", ")}` : "";
  const description = metadata.metric_description?.trim() || "No description available.";
  return `${metadata.measurement_name}${unit}\n${metadata.metric_key}\n${description}${aliases}`;
}
