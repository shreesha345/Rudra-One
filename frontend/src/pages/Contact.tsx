import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Mail, Phone, MapPin } from "lucide-react";

const Contact = () => {
  return (
    <div className="min-h-screen">
      <Navigation />
      
      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-[1200px] mx-auto text-center">
          <h1 className="text-foreground mb-6">Get in Touch</h1>
          <p className="text-xl text-foreground/75 max-w-2xl mx-auto font-light">
            Ready to transform your emergency response operations? Our team is here to help.
          </p>
        </div>
      </section>

      {/* Contact Content */}
      <section className="pb-24 px-6">
        <div className="max-w-[1200px] mx-auto">
          <div className="grid md:grid-cols-2 gap-12">
            {/* Contact Form */}
            <GlassCard>
              <h2 className="text-2xl text-foreground font-light mb-6">Send us a message</h2>
              <form className="space-y-6">
                <div>
                  <label htmlFor="name" className="block text-sm text-foreground/75 font-light mb-2">
                    Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    className="w-full px-4 py-3 bg-white/[0.03] border border-white/[0.06] rounded-xl text-foreground font-light focus:outline-none focus:ring-2 focus:ring-accent"
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label htmlFor="organization" className="block text-sm text-foreground/75 font-light mb-2">
                    Organization
                  </label>
                  <input
                    type="text"
                    id="organization"
                    className="w-full px-4 py-3 bg-white/[0.03] border border-white/[0.06] rounded-xl text-foreground font-light focus:outline-none focus:ring-2 focus:ring-accent"
                    placeholder="Your organization"
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm text-foreground/75 font-light mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    className="w-full px-4 py-3 bg-white/[0.03] border border-white/[0.06] rounded-xl text-foreground font-light focus:outline-none focus:ring-2 focus:ring-accent"
                    placeholder="your@email.com"
                  />
                </div>
                <div>
                  <label htmlFor="urgency" className="block text-sm text-foreground/75 font-light mb-2">
                    Urgency Level
                  </label>
                  <select
                    id="urgency"
                    className="w-full px-4 py-3 bg-white/[0.03] border border-white/[0.06] rounded-xl text-foreground font-light focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option>General inquiry</option>
                    <option>Sales inquiry</option>
                    <option>Technical support</option>
                    <option>Urgent — Active incident</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="message" className="block text-sm text-foreground/75 font-light mb-2">
                    Message
                  </label>
                  <textarea
                    id="message"
                    rows={5}
                    className="w-full px-4 py-3 bg-white/[0.03] border border-white/[0.06] rounded-xl text-foreground font-light focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                    placeholder="Tell us about your needs..."
                  />
                </div>
                <Button variant="neumorphic" size="lg" className="w-full">
                  Send Message
                </Button>
              </form>
              <p className="mt-6 text-sm text-foreground/60 font-light text-center">
                Enterprise customers: We respond within 2 hours with custom SLA agreements available.
              </p>
            </GlassCard>

            {/* Contact Info */}
            <div className="space-y-8">
              <GlassCard>
                <h3 className="text-xl text-foreground font-light mb-6">Contact Information</h3>
                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                      <Mail className="w-6 h-6 text-accent" strokeWidth={1.5} />
                    </div>
                    <div>
                      <p className="text-foreground/75 font-light mb-1">Email</p>
                      <a href="mailto:contact@rudraone.com" className="text-foreground hover:text-accent transition-colors">
                        contact@rudraone.com
                      </a>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                      <Phone className="w-6 h-6 text-accent" strokeWidth={1.5} />
                    </div>
                    <div>
                      <p className="text-foreground/75 font-light mb-1">Emergency Hotline</p>
                      <a href="tel:+18005551234" className="text-foreground hover:text-accent transition-colors">
                        +1 (800) 555-1234
                      </a>
                      <p className="text-sm text-foreground/60 font-light mt-1">24/7 for Enterprise customers</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-6 h-6 text-accent" strokeWidth={1.5} />
                    </div>
                    <div>
                      <p className="text-foreground/75 font-light mb-1">Headquarters</p>
                      <p className="text-foreground">
                        1234 Innovation Drive<br />
                        San Francisco, CA 94102<br />
                        United States
                      </p>
                    </div>
                  </div>
                </div>
              </GlassCard>

              <GlassCard>
                <h3 className="text-xl text-foreground font-light mb-4">Enterprise Sales</h3>
                <p className="text-foreground/75 font-light leading-relaxed mb-6">
                  Need a custom solution for your organization? Our enterprise team specializes in government and large-scale deployments.
                </p>
                <Button variant="glass" size="lg" className="w-full">
                  Schedule Demo
                </Button>
              </GlassCard>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Contact;
