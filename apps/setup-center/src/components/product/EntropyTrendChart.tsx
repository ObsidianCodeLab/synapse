import React from "react";
import Plot from "react-plotly.js";

interface EntropyTrendChartProps {
  data: number[];
  dates: string[];
  color: string;
}

export function EntropyTrendChart({ data, dates, color }: EntropyTrendChartProps) {
  const trace = {
    x: dates,
    y: data,
    type: "scatter" as const,
    mode: "lines+markers" as "lines+markers",
    line: { color, width: 1.5 },
    marker: { color, size: 4 },
    hoverinfo: "y" as "y",
  };

  const layout = {
    autosize: true,
    margin: { t: 5, r: 10, b: 32, l: 65 },
    annotations: [
      {
        text: "近<br>30<br>天<br>熵<br>指<br>标<br>趋<br>势<br>变<br>化",
        xref: "paper" as "paper",
        yref: "paper" as "paper",
        x: -0.08,
        y: 0.5,
        xanchor: "center" as "center",
        yanchor: "middle" as "middle",
        align: "center" as "center",
        showarrow: false,
        font: { size: 10, color: "#fff" },
      },
    ],
    xaxis: {
      type: "category" as "category",
      tickangle: 0,
      tickfont: { size: 7, color: "#aaa" },
      gridcolor: "rgba(128,128,128,0.08)",
      zeroline: true,
      zerolinecolor: "rgba(255,255,255,0.25)",
      zerolinewidth: 1,
      showline: true,
      linecolor: "rgba(255,255,255,0.3)",
      linewidth: 1,
      tickmode: "array" as "array",
      tickvals: dates,
    },
    yaxis: {
      range: [0, 105],
      tickmode: "array" as "array",
      tickvals: [0, 20, 40, 60, 80, 100],
      ticktext: ["0", "20", "40", "60", "80", "100"],
      tickfont: { size: 9, color: "#aaa" },
      gridcolor: "rgba(128,128,128,0.08)",
      zeroline: true,
      zerolinecolor: "rgba(255,255,255,0.25)",
      zerolinewidth: 1,
      showline: true,
      linecolor: "rgba(255,255,255,0.3)",
      linewidth: 1,
    },
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
    showlegend: false,
  };

  return (

    <Plot
      data={[trace]}
      layout={layout}
      config={{ responsive: true, displayModeBar: false }}
      style={{ width: "100%", height: "100%" }}
      useResizeHandler
    />
  );
}
