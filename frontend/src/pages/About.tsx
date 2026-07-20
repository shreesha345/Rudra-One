import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { GlassCard } from "@/components/GlassCard";
import { Target, Scale, Award } from "lucide-react";

const values = [
  {
    icon: Target,
    title: "Trust",
    description: "Built on transparency, security, and reliability for mission-critical operations.",
  },
  {
    icon: Scale,
    title: "Scale",
    description: "Engineered to handle national-scale emergencies with consistent performance.",
  },
  {
    icon: Award,
    title: "Accuracy",
    description: "AI-powered detection with industry-leading precision and minimal false positives.",
  },
];

const team = [
  {
    name: "Dr. Sarah Chen",
    role: "CEO & Co-Founder",
    bio: "Former Director of Emergency Response AI at FEMA. PhD in Computer Science from MIT.",
  },
  {
    name: "Michael Rodriguez",
    role: "CTO & Co-Founder",
    bio: "20+ years in critical infrastructure security. Previously led engineering at major defense contractor.",
  },
  {
    name: "Amanda Patel",
    role: "Chief Product Officer",
    bio: "Former emergency operations coordinator. Expert in multi-agency coordination systems.",
  },
];

const About = () => {
  return (
    <div className="min-h-screen">
      <Navigation />
      
      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-[1200px] mx-auto text-center">
          <h1 className="text-foreground mb-6">Our Mission</h1>
          <p className="text-xl md:text-2xl text-foreground/75 max-w-3xl mx-auto font-light leading-relaxed">
            We're building the future of emergency response — where AI and human expertise work together to save lives and protect communities at scale.
          </p>
        </div>
      </section>

      {/* Values */}
      <section className="py-16 px-6">
        <div className="max-w-[1200px] mx-auto">
          <h2 className="text-center text-foreground mb-12">Our Values</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {values.map((value, index) => (
              <GlassCard key={index} hover className="text-center">
                <div className="mb-6 flex justify-center">
                  <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center">
                    <value.icon className="w-8 h-8 text-accent" strokeWidth={1.5} />
                  </div>
                </div>
                <h3 className="text-xl mb-3 text-foreground font-light">{value.title}</h3>
                <p className="text-foreground/60 font-light leading-relaxed">
                  {value.description}
                </p>
              </GlassCard>
            ))}
          </div>
        </div>
      </section>

      {/* Timeline / Story */}
      <section className="py-24 px-6 bg-background/50">
        <div className="max-w-[900px] mx-auto">
          <GlassCard>
            <h2 className="text-foreground mb-6">Our Story</h2>
            <div className="space-y-6 text-foreground/75 font-light leading-relaxed">
              <p>
                RudraOne was founded in 2023 by a team of emergency response professionals, AI researchers, and critical infrastructure experts who witnessed firsthand the challenges facing modern emergency operations.
              </p>
              <p>
                Traditional emergency response systems struggle with fragmented data, delayed coordination, and overwhelming false alarms. We knew there had to be a better way.
              </p>
              <p>
                By combining cutting-edge AI with deep operational expertise, we created RudraOne — a platform that detects real threats in real time, coordinates response across agencies seamlessly, and learns continuously to improve accuracy.
              </p>
              <p>
                Today, RudraOne protects millions of people across government agencies, critical infrastructure operators, and enterprise security teams worldwide.
              </p>
            </div>
          </GlassCard>
        </div>
      </section>

      {/* Leadership Team */}
      <section className="py-24 px-6">
        <div className="max-w-[1200px] mx-auto">
          <h2 className="text-center text-foreground mb-12">Leadership Team</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {team.map((member, index) => (
              <GlassCard key={index} hover className="text-center">
                <div className="mb-6">
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-brand-copper to-brand-violet mx-auto mb-4"></div>
                  <h3 className="text-xl text-foreground font-light mb-1">{member.name}</h3>
                  <p className="text-sm text-accent font-light">{member.role}</p>
                </div>
                <p className="text-foreground/60 font-light leading-relaxed text-sm">
                  {member.bio}
                </p>
              </GlassCard>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default About;
