import { GlassCard } from "./GlassCard";
import { Eye, Users, FileCheck, Shield } from "lucide-react";

const features = [
  {
    icon: Eye,
    title: "Real-Time Detection",
    description: "Continuous monitoring with anomaly scoring across all integrated feeds and sensors.",
  },
  {
    icon: Users,
    title: "Automated Coordination",
    description: "Multi-agency orchestration & tasking with intelligent workflow automation.",
  },
  {
    icon: FileCheck,
    title: "Incident Audit & Compliance",
    description: "Immutable logs, chain of custody, and complete audit trails for regulatory compliance.",
  },
  {
    icon: Shield,
    title: "Scalable Secure Architecture",
    description: "FedRAMP and enterprise-ready infrastructure built for national-scale operations.",
  },
];

export const Features = () => {
  return (
    <section id="features" className="pt-10 pb-24 px-6 bg-background/50">
      <div className="max-w-[1200px] mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-foreground mb-4">Enterprise Features</h2>
          <p className="text-lg text-foreground/65 font-light max-w-2xl mx-auto">
            Mission-critical capabilities for government and enterprise operations
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {features.map((feature, index) => (
            <GlassCard key={index} hover>
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-xl bg-brand-copper/10 flex items-center justify-center flex-shrink-0">
                  <feature.icon className="w-7 h-7 text-brand-copper" strokeWidth={1.5} />
                </div>
                <div>
                  <h3 className="text-xl mb-2 text-foreground font-light">{feature.title}</h3>
                  <p className="text-foreground/60 font-light leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      </div>
    </section>
  );
};
