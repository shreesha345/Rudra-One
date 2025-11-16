import { GlassCard } from "./GlassCard";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "/month",
    features: [
      "Up to 5 sensor connections",
      "Basic anomaly detection",
      "7-day data retention",
      "Email support",
    ],
    cta: "Get Started",
    variant: "glass" as const,
  },
  {
    name: "Pro",
    price: "$499",
    period: "/month",
    recommended: true,
    features: [
      "Unlimited sensor connections",
      "Advanced AI detection models",
      "90-day data retention",
      "Multi-agency coordination",
      "Priority support",
      "Custom integrations",
    ],
    cta: "Start Pro Trial",
    variant: "neumorphic" as const,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    features: [
      "Everything in Pro",
      "Custom SLA agreements",
      "Dedicated onboarding team",
      "White-label options",
      "On-premise deployment",
      "24/7 phone support",
    ],
    cta: "Contact Sales",
    variant: "glass" as const,
  },
];

export const Pricing = () => {
  return (
    <section id="pricing" className="py-24 px-6">
      <div className="max-w-[1200px] mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-foreground mb-4">Pricing Plans</h2>
          <p className="text-lg text-foreground/65 font-light max-w-2xl mx-auto">
            Choose the plan that fits your operational needs
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {plans.map((plan) => (
            <div key={plan.name} className="relative">
              {plan.recommended && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
                  <div className="px-4 py-1 bg-accent text-accent-foreground rounded-full text-sm font-light">
                    Recommended
                  </div>
                </div>
              )}
              <GlassCard
                className={`h-full ${
                  plan.recommended
                    ? "bg-white/[0.10] shadow-[0_24px_48px_rgba(7,9,12,0.4)] scale-105"
                    : ""
                }`}
              >
                <div className="text-center mb-6">
                  <h3 className="text-2xl text-foreground font-light mb-2">{plan.name}</h3>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-4xl text-foreground font-light">{plan.price}</span>
                    <span className="text-foreground/60 font-light">{plan.period}</span>
                  </div>
                </div>

                <ul className="space-y-4 mb-8">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                      <span className="text-foreground/75 font-light">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button variant={plan.variant} size="lg" className="w-full">
                  {plan.cta}
                </Button>
              </GlassCard>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
