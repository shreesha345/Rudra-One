import { GlassCard } from "./GlassCard";
import { Rss, Brain, Zap } from "lucide-react";

const steps = [
  {
    icon: Rss,
    title: "Connect your sensors & systems",
    description: "Securely ingest CCTV, IoT, telemetry, and public feeds.",
  },
  {
    icon: Brain,
    title: "Set up your AI assistant",
    description: "Custom models tuned for your environment and policies.",
  },
  {
    icon: Zap,
    title: "Automate response & coordination",
    description: "Dispatch assets, alert partners, and execute playbooks in seconds.",
  },
];

export const HowItWorksInline = () => {
  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="text-center mb-12">
        <h2 className="text-foreground mb-4">How It Works</h2>
        <p className="text-lg text-foreground/65 font-light max-w-2xl mx-auto">
          Three simple steps to enterprise-grade emergency intelligence
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {steps.map((step, index) => (
          <GlassCard key={index} hover className="text-center">
            <div className="mb-6 flex justify-center">
              <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center">
                <step.icon className="w-8 h-8 text-accent" strokeWidth={1.5} />
              </div>
            </div>
            <h3 className="text-xl mb-3 text-foreground font-light">{step.title}</h3>
            <p className="text-foreground/60 font-light leading-relaxed">
              {step.description}
            </p>
          </GlassCard>
        ))}
      </div>
    </div>
  );
};