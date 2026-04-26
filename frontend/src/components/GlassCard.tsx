import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}

export const GlassCard = ({ children, className, hover = false }: GlassCardProps) => {
  return (
    <div
      className={cn(
        "bg-white/[0.06] border border-white/[0.06] backdrop-blur-xl rounded-2xl p-6 shadow-[0_20px_40px_rgba(7,9,12,0.3)] transition-all duration-300",
        hover && "hover:bg-white/[0.10] hover:shadow-[0_24px_48px_rgba(7,9,12,0.4)] hover:-translate-y-1",
        className
      )}
    >
      {children}
    </div>
  );
};
