import { Maximize2, Minimize2 } from "lucide-react";
export type Appearance = {
  theme: "aurora" | "ocean" | "mint" | "ember";
  density: "comfortable" | "compact";
};
export const defaultAppearance: Appearance = {
  theme: "aurora",
  density: "comfortable",
};
export function readAppearance(): Appearance {
  try {
    const value = JSON.parse(
      localStorage.getItem("evidencelab.appearance") ?? "null",
    );
    if (
      value &&
      ["aurora", "ocean", "mint", "ember"].includes(value.theme) &&
      ["comfortable", "compact"].includes(value.density)
    )
      return value;
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
      <div className="theme-swatches">
        {(["aurora", "ocean", "mint", "ember"] as const).map((theme) => (
          <button
            aria-label={`${theme[0].toUpperCase() + theme.slice(1)} colour theme`}
            title={`${theme} theme`}
            aria-pressed={value.theme === theme}
            className={`theme-swatch ${theme} ${value.theme === theme ? "selected" : ""}`}
            key={theme}
            onClick={() => onChange({ ...value, theme })}
          />
        ))}
      </div>
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
