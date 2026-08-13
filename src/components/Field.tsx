import { useRef, useState, type ReactNode } from "react";
import Icon from "./Icon";
import Sheet from "./Sheet";
import { fmtDate, fmtMonth } from "../lib/format";

/**
 * App-styled form controls.
 *
 * Every date/month/select used to be a bare native control, so seven date
 * fields looked like seven different things and none of them looked like the
 * app. These give the *resting* state — what's actually on screen — one shape.
 *
 * Date and month deliberately keep the native picker behind `showPicker()`:
 * it costs ~2% of a custom calendar and keeps native keyboard entry, locale
 * handling and screen-reader semantics for free.
 */

/**
 * Consistent label + control wrapper. Three patterns had grown up; this is the one.
 *
 * Deliberately a <div>, not a <label>: these controls are buttons, so a label
 * buys no association — but it does forward every click inside it to the first
 * labelable descendant. With a sheet rendered in here, a backdrop click was
 * re-triggering the trigger, so the sheet closed and reopened in the same tick
 * and appeared not to dismiss at all. The buttons carry their own aria-label.
 */
export function Field({ label, children }: { label?: string; children: ReactNode }) {
  if (!label) return <>{children}</>;
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      {children}
    </div>
  );
}

function NativeBackedField({
  type,
  value,
  display,
  placeholder,
  min,
  max,
  ariaLabel,
  onChange,
}: {
  type: "date" | "month";
  value: string;
  display: string | null;
  placeholder: string;
  min?: string;
  max?: string;
  ariaLabel?: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  /**
   * The real input sits transparently ON TOP of the styled row, rather than
   * being hidden beside it.
   *
   * An earlier version shrank the input to 1px and called `showPicker()` from a
   * button. That only works where `showPicker` is supported — on iOS Safari a
   * programmatic click on an invisible input opens nothing, which broke every
   * date field on iPhone. Overlaying means the tap lands on the native control
   * itself, so the picker opens the way the platform intends, everywhere.
   *
   * `showPicker()` is still called opportunistically: on desktop Chrome a click
   * on the input's text area alone wouldn't open the calendar.
   */
  function open() {
    const el = ref.current;
    if (el && typeof el.showPicker === "function") {
      try {
        el.showPicker();
      } catch {
        /* the tap already reached the input; the platform takes it from here */
      }
    }
  }

  return (
    <span className="field-wrap">
      <span className={`field-trigger ${display ? "" : "empty"}`} aria-hidden="true">
        <Icon name="calendar" className="field-icon" />
        <span className="field-value">{display ?? placeholder}</span>
        <Icon name="chevronDown" className="chev" />
      </span>
      <input
        ref={ref}
        type={type}
        className="field-native"
        value={value}
        min={min}
        max={max}
        aria-label={ariaLabel}
        onClick={open}
        onChange={(e) => onChange(e.target.value)}
      />
    </span>
  );
}

export function DateField({
  value,
  onChange,
  min,
  max,
  label,
  placeholder = "Any date",
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  label?: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  return (
    <Field label={label}>
      <NativeBackedField
        type="date"
        value={value}
        display={value ? fmtDate(value) : null}
        placeholder={placeholder}
        min={min}
        max={max}
        ariaLabel={ariaLabel ?? label}
        onChange={onChange}
      />
    </Field>
  );
}

export function MonthField({
  value,
  onChange,
  min,
  max,
  label,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  label?: string;
  ariaLabel?: string;
}) {
  return (
    <Field label={label}>
      <NativeBackedField
        type="month"
        value={value}
        display={value ? fmtMonth(value) : null}
        placeholder="Pick a month"
        min={min}
        max={max}
        ariaLabel={ariaLabel ?? label}
        onChange={onChange}
      />
    </Field>
  );
}

export type SelectOption = { value: string; label: string; icon?: string };

/** Sheet-based select, matching CategoryField rather than a native dropdown. */
export function SelectField({
  value,
  options,
  onChange,
  label,
  title = "Choose",
  ariaLabel,
}: {
  value: string;
  options: SelectOption[];
  onChange: (v: string) => void;
  label?: string;
  title?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <Field label={label}>
      <button
        type="button"
        className="field-trigger"
        onClick={() => setOpen(true)}
        aria-label={ariaLabel ?? label}
      >
        <span className="field-value">
          {selected?.icon && <span aria-hidden="true">{selected.icon} </span>}
          {selected?.label ?? title}
        </span>
        <Icon name="chevronDown" className="chev" />
      </button>
      {open && (
        <Sheet title={title} className="picker-sheet" onClose={() => setOpen(false)}>
          <h3>{title}</h3>
          <div className="sheet-rows">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                className="sheet-row"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                <span>
                  {o.icon && <span aria-hidden="true">{o.icon} </span>}
                  {o.label}
                </span>
                {o.value === value && <Icon name="check" className="check" />}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </Field>
  );
}

/** −/+ stepper. Replaces a bare number spinner explained only by a `title`. */
export function Stepper({
  value,
  onChange,
  min = 1,
  max = 24,
  label,
  suffix,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  label?: string;
  suffix?: string;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <Field label={label}>
      {/* the wrapper carries the name, since Field is no longer a <label> */}
      <span className="stepper" role="group" aria-label={label}>
        <button
          type="button"
          onClick={() => onChange(clamp(value - 1))}
          disabled={value <= min}
          aria-label={label ? `Decrease ${label.toLowerCase()}` : "Decrease"}
        >
          <Icon name="minus" />
        </button>
        <span className="stepper-value" aria-live="polite">
          {value}
          {suffix && <span className="stepper-suffix"> {suffix}</span>}
        </span>
        <button
          type="button"
          onClick={() => onChange(clamp(value + 1))}
          disabled={value >= max}
          aria-label={label ? `Increase ${label.toLowerCase()}` : "Increase"}
        >
          <Icon name="plus" />
        </button>
      </span>
    </Field>
  );
}
