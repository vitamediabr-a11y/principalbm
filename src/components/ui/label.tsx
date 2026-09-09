import * as React from "react";
import { cn } from "@/lib/cn";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-sm font-medium text-slate-800", className)} {...props} />;
}
