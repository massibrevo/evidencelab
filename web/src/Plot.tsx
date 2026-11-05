import { useEffect, useRef } from "react";
import type { Data, Layout } from "plotly.js";
import Plotly from "plotly.js-cartesian-dist-min";
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
        font: { family: "monospace", color: "#9baac8", size: 11 },
        margin: { l: 45, r: 20, t: 20, b: 40 },
        xaxis: { gridcolor: "#2b3550", zeroline: false },
        yaxis: { gridcolor: "#2b3550", zeroline: false },
        ...layout,
      },
      {
        responsive: true,
        toImageButtonOptions: {
          format: "png",
          filename: "evidencelab-chart",
          scale: 2,
        },
        displaylogo: false,
        modeBarButtons: [
          ["toImage"],
          ["zoom2d", "pan2d"],
          ["zoomIn2d", "zoomOut2d", "autoScale2d", "resetScale2d"],
        ],
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
