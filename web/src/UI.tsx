import { Check, Copy, FlaskConical, Maximize2 } from "lucide-react";
import { useState } from "react";
import type { CI, Projection } from "./types";
export const colors = {
  retrieval: "#14b8a6",
  adaptation: "#9472b0",
  verification: "#ed9127",
  coordination: "#2684b7",
  biology: "#5481c2",
} as Record<string, string>;
export const pct = (n: number) => (n * 100).toFixed(1) + "%";
export function IconButton({
  children,
  label,
  onClick,
  disabled = false,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="icon-button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
export function Tag({
  children,
  tone = "green",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={"tag " + tone}>{children}</span>;
}
export function Empty({
  icon: Icon = FlaskConical,
  title,
  text,
  children,
}: {
  icon?: typeof FlaskConical;
  title: string;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={27} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}
export function MiniSpace({
  projection,
  onClick,
}: {
  projection: Projection | null;
  onClick: () => void;
}) {
  const points = projection?.points ?? [];
  const range = (key: "x" | "y") => [
    Math.min(...points.map((p) => p[key]), -0.1),
    Math.max(...points.map((p) => p[key]), 0.1),
  ];
  const xr = range("x"),
    yr = range("y");
  return (
    <button
      onClick={onClick}
      className="mini-space"
      aria-label="Open vector explorer"
    >
      <svg
        viewBox="0 0 400 180"
        role="img"
        aria-label="PCA projection of corpus chunks"
      >
        <defs>
          <pattern
            id="dotgrid"
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r=".7" fill="#354039" />
          </pattern>
        </defs>
        <rect width="400" height="180" fill="url(#dotgrid)" />
        {points.map((p) => (
          <circle
            key={p.id}
            cx={22 + ((p.x - xr[0]) / (xr[1] - xr[0])) * 355}
            cy={17 + ((p.y - yr[0]) / (yr[1] - yr[0])) * 145}
            r="2.4"
            fill={colors[p.group]}
            opacity=".75"
          />
        ))}
      </svg>
      <span className="mini-overlay">
        {projection?.representation ?? "Loading"} · PCA <Maximize2 size={12} />
      </span>
    </button>
  );
}
export function CIBar({ value }: { value: CI }) {
  return (
    <div className="ci-wrap">
      <div className="ci-track">
        <span
          style={{
            left: `${value.low * 100}%`,
            width: `${Math.max((value.high - value.low) * 100, 1)}%`,
          }}
        />
        <i style={{ left: `${value.mean * 100}%` }} />
      </div>
      <small>
        {pct(value.low)} – {pct(value.high)}
      </small>
    </div>
  );
}
export function Code({ children }: { children: string | string[] }) {
  const content = Array.isArray(children) ? children.join("") : children;
  const [copied, setCopied] = useState(false);
  return (
    <div className="code">
      <code>{content}</code>
      <IconButton
        label="Copy command"
        onClick={() => {
          navigator.clipboard.writeText(content).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          });
        }}
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
      </IconButton>
    </div>
  );
}
