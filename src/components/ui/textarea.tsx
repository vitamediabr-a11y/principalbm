import * as React from "react";
import { cn } from "@/lib/cn";

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("min-h-24 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-950 outline-none placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200 sm:text-sm", className)} {...props} />;
}
