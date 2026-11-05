import { useEffect, useRef } from "react";
import type { Data, Layout } from "plotly.js";
import Plotly from "plotly.js-basic-dist-min";
export default function Plot({
  data,
  layout = {},
  onClick,
}: {
  data: Data[];
  layout?: Partial<Layout>;
  onClick?: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current!;
    Plotly.react(
      el,
      data,
      {
        paper_bgcolor: "transparent",
        plot_bgcolor: "transparent",
        font: { family: "monospace", color: "#8c9690", size: 10 },
        margin: { l: 45, r: 20, t: 20, b: 40 },
        xaxis: { gridcolor: "#242c27", zeroline: false },
        yaxis: { gridcolor: "#242c27", zeroline: false },
        ...layout,
      },
      {
        responsive: true,
        displaylogo: false,
        modeBarButtonsToRemove: ["lasso2d", "select2d"],
      },
    );
    if (onClick)
      (
        el as unknown as {
          on: (
            s: string,
            f: (e: { points: { customdata: string }[] }) => void,
          ) => void;
        }
      ).on("plotly_click", (e) => {
        if (e.points[0]?.customdata) onClick(e.points[0].customdata);
      });
    const observer = new ResizeObserver(() => Plotly.Plots.resize(el));
    observer.observe(el);
    return () => {
      observer.disconnect();
      Plotly.purge(el);
    };
  }, [data, layout, onClick]);
  return <div ref={ref} className="plot" />;
}
