import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

// Classic Jupyter/IPython colours on the light grey code-cell surface.
export const notebookHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.keyword, color: "#008000", fontWeight: "bold" },
    { tag: tags.string, color: "#ba2121" },
    { tag: tags.comment, color: "#408080", fontStyle: "italic" },
    { tag: tags.number, color: "#008000" },
    { tag: tags.operator, color: "#666666" },
    { tag: tags.variableName, color: "#212121" },
    { tag: tags.standard(tags.variableName), color: "#008000" },
    {
      tag: [tags.function(tags.variableName), tags.className],
      color: "#0000ff",
    },
    { tag: tags.meta, color: "#aa22ff" },
  ]),
);
