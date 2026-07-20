import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { GlassCard } from "@/components/GlassCard";
import { ArrowRight, Calendar, User } from "lucide-react";

const articles = [
  {
    title: "How AI Reduced Response Time During the 2025 Wildfire Season",
    excerpt: "A deep dive into how RudraOne's AI detection system helped emergency teams respond 45% faster during critical wildfire events.",
    author: "A. Patel",
    date: "Apr 3, 2025",
    tags: ["AI", "Case Study", "Wildfires"],
    image: "fire",
  },
  {
    title: "Integrating Legacy Dispatch Systems with Modern AI",
    excerpt: "Best practices and technical strategies for connecting decades-old CAD systems with cutting-edge AI platforms.",
    author: "M. Chen",
    date: "Mar 18, 2025",
    tags: ["Integration", "Technical"],
    image: "tech",
  },
  {
    title: "Best Practices for Multi-Agency Emergency Coordination",
    excerpt: "Learn how to streamline communication and response across multiple jurisdictions and organizations during critical incidents.",
    author: "S. Rivera",
    date: "Feb 12, 2025",
    tags: ["Operations", "Coordination"],
    image: "team",
  },
  {
    title: "Securing Real-Time Sensor Feeds at National Scale",
    excerpt: "An in-depth look at the security architecture required to protect critical infrastructure monitoring systems.",
    author: "L. Gomez",
    date: "Jan 30, 2025",
    tags: ["Security", "Infrastructure"],
    image: "security",
  },
];

const Blog = () => {
  return (
    <div className="min-h-screen">
      <Navigation />
      
      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-[1200px] mx-auto text-center">
          <h1 className="text-foreground mb-6">Blog & Insights</h1>
          <p className="text-xl text-foreground/75 max-w-2xl mx-auto font-light">
            Expert perspectives on emergency response, AI, and critical infrastructure.
          </p>
        </div>
      </section>

      {/* Articles Grid */}
      <section className="pb-24 px-6">
        <div className="max-w-[1200px] mx-auto">
          <div className="grid md:grid-cols-2 gap-8">
            {articles.map((article, index) => (
              <GlassCard key={index} hover className="group cursor-pointer">
                {/* Image placeholder */}
                <div className="w-full h-48 mb-6 rounded-xl bg-gradient-to-br from-brand-copper/20 to-brand-violet/20 flex items-center justify-center">
                  <span className="text-foreground/30 font-light text-sm uppercase tracking-widest">
                    {article.image}
                  </span>
                </div>

                {/* Tags */}
                <div className="flex gap-2 mb-4">
                  {article.tags.map((tag, tagIndex) => (
                    <span
                      key={tagIndex}
                      className="px-3 py-1 text-xs font-light rounded-full bg-accent/10 text-accent border border-accent/20"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Content */}
                <h3 className="text-2xl text-foreground font-light mb-3 group-hover:text-accent transition-colors">
                  {article.title}
                </h3>
                <p className="text-foreground/65 font-light leading-relaxed mb-6">
                  {article.excerpt}
                </p>

                {/* Meta */}
                <div className="flex items-center justify-between pt-4 border-t border-white/[0.06]">
                  <div className="flex items-center gap-4 text-sm text-foreground/60 font-light">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4" strokeWidth={1.5} />
                      {article.author}
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" strokeWidth={1.5} />
                      {article.date}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-accent font-light text-sm group-hover:gap-3 transition-all">
                    Read more
                    <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Blog;
