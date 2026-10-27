import { StreamLanguage } from "@codemirror/language";
import { sparql } from "@codemirror/legacy-modes/mode/sparql";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useMemo } from "react";

type SparqlEditorProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  height?: string;
};

export function SparqlEditor({
  id,
  value,
  onChange,
  ariaLabel = "Query text",
  height = "180px"
}: SparqlEditorProps) {
  const extensions = useMemo(
    () => [
      StreamLanguage.define(sparql),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ id, "aria-label": ariaLabel })
    ],
    [ariaLabel, id]
  );

  return (
    <CodeMirror
      className="sparql-editor"
      value={value}
      height={height}
      extensions={extensions}
      basicSetup={{ lineNumbers: true, foldGutter: false }}
      onChange={onChange}
    />
  );
}
