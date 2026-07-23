import type { CSSProperties } from "react";
import {
  formatMetricMetadataTooltip,
  useMetricMetadata
} from "../context/MetricMetadataContext";

export type MetricNameProps = {
  id: string;
  className?: string;
  style?: CSSProperties;
};

export function MetricName({ id, className, style }: MetricNameProps) {
  const metadata = useMetricMetadata(id);
  const classes = ["metric-name", className].filter(Boolean).join(" ");

  if (!metadata) {
    return (
      <span className={classes} style={style} title={id}>
        {id}
      </span>
    );
  }

  const aliases = metadata.alias.filter((alias) => alias !== id);

  return (
    <span className={classes} style={style} tabIndex={0}>
      <span className="metric-name-label">{id}</span>
      <span className="metric-name-tooltip" role="tooltip">
        <span className="metric-name-tooltip-title">
          {metadata.measurement_name}
          {metadata.unit ? ` · ${metadata.unit}` : ""}
        </span>
        <span className="metric-name-tooltip-kind">{metadata.metric_key}</span>
        <span className="metric-name-tooltip-description">
          {metadata.metric_description?.trim() || "No description available."}
        </span>
        {aliases.length > 0 && (
          <span className="metric-name-tooltip-aliases">
            Aliases: {aliases.join(", ")}
          </span>
        )}
        {metadata.measurement_uri && (
          <span className="metric-name-tooltip-uri" title={metadata.measurement_uri}>
            {metadata.measurement_uri}
          </span>
        )}
      </span>
      <span className="sr-only">{formatMetricMetadataTooltip(metadata)}</span>
    </span>
  );
}
