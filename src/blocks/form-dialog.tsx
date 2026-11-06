import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface FormFieldSpec {
  name: string;
  label: string;
  type?: "text" | "email" | "number" | "date" | "time" | "textarea" | "select";
  options?: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
  /** Half width: two such fields share a row. */
  half?: boolean;
  initial?: string;
}

/**
 * A form in a modal: fields from a list, required ones checked on submit, the first problem
 * focused. `onSubmit` gets the values; the dialog closes after it.
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  fields,
  submitLabel = "Save",
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  fields: FormFieldSpec[];
  submitLabel?: string;
  onSubmit: (values: Record<string, string>) => void;
}) {
  const initial = () => Object.fromEntries(fields.map((f) => [f.name, f.initial ?? ""]));
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when it opens
  useEffect(() => {
    if (open) {
      setValues(initial());
      setErrors({});
    }
  }, [open]);
  const set = (name: string, value: string) => {
    setValues((v) => ({ ...v, [name]: value }));
    if (errors[name]) setErrors((e) => ({ ...e, [name]: "" }));
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const missing = Object.fromEntries(
      fields.filter((f) => f.required && !values[f.name]?.trim()).map((f) => [f.name, `${f.label} is needed`]),
    );
    setErrors(missing);
    const first = Object.keys(missing)[0];
    if (first) {
      document.getElementById(`field-${first}`)?.focus();
      return;
    }
    onSubmit(values);
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <FieldGroup className="my-5 grid grid-cols-2 gap-4">
            {fields.map((f) => {
              const id = `field-${f.name}`;
              const err = errors[f.name];
              return (
                <Field key={f.name} data-invalid={err ? true : undefined} className={cn(f.half ? "col-span-1" : "col-span-2")}>
                  <FieldLabel htmlFor={id}>
                    {f.label}
                    {!f.required && <span className="font-normal text-muted-foreground">(optional)</span>}
                  </FieldLabel>
                  {f.type === "select" ? (
                    <Select value={values[f.name]} onValueChange={(v) => set(f.name, v)}>
                      <SelectTrigger id={id} aria-invalid={err ? true : undefined} className="w-full">
                        <SelectValue placeholder={f.placeholder ?? "Choose…"} />
                      </SelectTrigger>
                      <SelectContent>
                        {f.options?.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : f.type === "textarea" ? (
                    <Textarea
                      id={id}
                      value={values[f.name]}
                      placeholder={f.placeholder}
                      aria-invalid={err ? true : undefined}
                      onChange={(e) => set(f.name, e.target.value)}
                      className="min-h-24"
                    />
                  ) : (
                    <Input
                      id={id}
                      type={f.type ?? "text"}
                      value={values[f.name]}
                      placeholder={f.placeholder}
                      aria-invalid={err ? true : undefined}
                      onChange={(e) => set(f.name, e.target.value)}
                    />
                  )}
                  <div className="min-h-5">{err && <FieldError>{err}</FieldError>}</div>
                </Field>
              );
            })}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{submitLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
