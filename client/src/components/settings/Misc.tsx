import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

// ─── Toggle Switch ────────────────────────────────────────────────────────────
export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        checked ? "bg-primary" : "bg-muted-foreground/30"
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-card shadow transition-transform",
          checked ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  );
}

// ─── Field wrapper ────────────────────────────────────────────────────────────
export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-foreground">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ─── DebouncedInput ─────────────────────────────────────────────────────────
export function DebouncedInput({ 
  value, 
  onChange, 
  ...props 
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> & {
  value?: string | number;
  onChange?: (e: any) => void;
}) {
  const [localValue, setLocalValue] = useState(value ?? "");

  useEffect(() => {
    setLocalValue(value ?? "");
  }, [value]);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (localValue !== (value ?? "") && onChange) {
        onChange({ target: { value: String(localValue) } });
      }
    }, 400);
    return () => clearTimeout(handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localValue]);

  return (
    <Input
      {...props}
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
    />
  );
}

// ─── DebouncedTextarea ────────────────────────────────────────────────────────
export function DebouncedTextarea({ 
  value, 
  onChange, 
  ...props 
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange"> & {
  value?: string | number;
  onChange?: (e: { target: { value: string } }) => void;
}) {
  const [localValue, setLocalValue] = useState(value ?? "");

  useEffect(() => {
    setLocalValue(value ?? "");
  }, [value]);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (localValue !== (value ?? "") && onChange) {
        onChange({ target: { value: String(localValue) } });
      }
    }, 400);
    return () => clearTimeout(handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localValue]);

  return (
    <textarea
      {...props}
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
    />
  );
}