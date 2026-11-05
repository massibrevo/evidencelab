import { Maximize2, Minimize2 } from "lucide-react";
export type Appearance = {
  density: "comfortable" | "compact";
};
export const defaultAppearance: Appearance = {
  density: "comfortable",
};
export function readAppearance(): Appearance {
  try {
    const value = JSON.parse(
      localStorage.getItem("evidencelab.appearance") ?? "null",
    );
    if (value && ["comfortable", "compact"].includes(value.density))
      return { density: value.density };
  } catch {}
  return defaultAppearance;
}
export default function AppearanceControls({
  value,
  onChange,
}: {
  value: Appearance;
  onChange: (value: Appearance) => void;
}) {
  return (
    <div className="appearance-controls" aria-label="Workspace appearance">
      <button
        className="icon-button density-button"
        aria-label={
          value.density === "comfortable"
            ? "Use compact layout"
            : "Use comfortable layout"
        }
        title="Toggle layout density"
        onClick={() =>
          onChange({
            ...value,
            density:
              value.density === "comfortable" ? "compact" : "comfortable",
          })
        }
      >
        {value.density === "comfortable" ? (
          <Minimize2 size={14} />
        ) : (
          <Maximize2 size={14} />
        )}
      </button>
    </div>
  );
}
