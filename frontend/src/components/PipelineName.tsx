import type { CSSProperties } from "react";
import {
  formatPipelineMetadataTooltip,
  usePipelineMetadata
} from "../context/PipelineMetadataContext";

export type PipelineNameProps = {
  id: string;
  className?: string;
  style?: CSSProperties;
};

export function PipelineName({ id, className, style }: PipelineNameProps) {
  const metadata = usePipelineMetadata(id);
  const classes = ["pipeline-name", className].filter(Boolean).join(" ");

  if (!metadata) {
    return (
      <span className={classes} style={style} title={id}>
        {id}
      </span>
    );
  }

  return (
    <span className={classes} style={style} tabIndex={0}>
      <span className="pipeline-name-label">{id}</span>
      <span className="pipeline-name-tooltip" role="tooltip">
        <span className="pipeline-name-tooltip-title">{metadata.display_name}</span>
        <span className="pipeline-name-tooltip-kind">
          {metadata.kind === "atomic" ? "Atomic pipeline" : "Composite pipeline"}
          {metadata.variant ? ` · variant ${metadata.variant}` : ""}
        </span>
        <span className="pipeline-name-tooltip-description">{metadata.description}</span>
        <span className="pipeline-name-tooltip-steps">
          {metadata.steps.map((step) => (
            <span key={`${metadata.id}-${step.step_number}`} className="pipeline-name-tooltip-step">
              <strong>{step.step_number}.</strong> {step.task_name}
              <span className="muted"> — {step.description}</span>
            </span>
          ))}
        </span>
        <span className="pipeline-name-tooltip-uri" title={metadata.uri}>
          {metadata.uri}
        </span>
      </span>
      <span className="sr-only">{formatPipelineMetadataTooltip(metadata)}</span>
    </span>
  );
}
