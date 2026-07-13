import type { ReactNode } from "react";
import { Field, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";

interface FormRowProps {
  label: string;
  htmlFor: string;
  error?: { message?: string };
  description?: string;
  required?: boolean;
  children: ReactNode;
}

export function FormRow({
  label,
  htmlFor,
  error,
  description,
  required,
  children,
}: FormRowProps) {
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={htmlFor}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </FieldLabel>
      {children}
      {description && !error ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError errors={error ? [error] : undefined} />
    </Field>
  );
}
