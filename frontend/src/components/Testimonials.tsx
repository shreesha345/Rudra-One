import { GlassCard } from "./GlassCard";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

const testimonials = [
  {
    quote: "RudraOne cut our average incident response time by 45%.",
    author: "Sarah Chen",
    title: "Chief, City Emergency Operations",
    result: "45% faster response",
  },
  {
    quote: "We neutralized two major industrial incidents without false escalations.",
    author: "Michael Rodriguez",
    title: "VP, Industrial Safety",
    result: "Zero false positives",
  },
  {
    quote: "Seamless coordination across five agencies during the wildfire season.",
    author: "Dr. Amanda Patel",
    title: "Director, Regional Emergency Management",
    result: "1,200 people protected",
  },
  {
    quote: "The AI detection capabilities exceeded our expectations for national security operations.",
    author: "James Wilson",
    title: "Senior Director, Federal Operations",
    result: "98% threat detection rate",
  },
];

export const Testimonials = () => {
  const [currentIndex, setCurrentIndex] = useState(0);

  const next = () => {
    setCurrentIndex((prev) => (prev + 1) % testimonials.length);
  };

  const prev = () => {
    setCurrentIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length);
  };

  return (
    <section className="py-24 px-6">
      <div className="max-w-[1200px] mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-foreground mb-4">Trusted by Leaders</h2>
          <p className="text-lg text-foreground/65 font-light max-w-2xl mx-auto">
            Real results from emergency response professionals
          </p>
        </div>

        <div className="relative">
          <div className="overflow-hidden">
            <div
              className="flex transition-transform duration-500 ease-out"
              style={{ transform: `translateX(-${currentIndex * 100}%)` }}
            >
              {testimonials.map((testimonial, index) => (
                <div key={index} className="w-full flex-shrink-0 px-4">
                  <GlassCard className="max-w-3xl mx-auto text-center">
                    <p className="text-2xl text-foreground/90 font-light leading-relaxed mb-8">
                      "{testimonial.quote}"
                    </p>
                    <div className="space-y-2">
                      <p className="text-foreground font-light">{testimonial.author}</p>
                      <p className="text-sm text-foreground/60">{testimonial.title}</p>
                      <div className="inline-block mt-4 px-4 py-2 rounded-full bg-accent/10 border border-accent/20">
                        <p className="text-sm text-accent font-light">{testimonial.result}</p>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              ))}
            </div>
          </div>

          {/* Navigation */}
          <button
            onClick={prev}
            className="absolute left-0 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/[0.06] backdrop-blur-xl hover:bg-white/[0.10] transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            onClick={next}
            className="absolute right-0 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/[0.06] backdrop-blur-xl hover:bg-white/[0.10] transition-colors"
          >
            <ChevronRight className="w-6 h-6" />
          </button>

          {/* Indicators */}
          <div className="flex justify-center gap-2 mt-8">
            {testimonials.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentIndex(index)}
                className={`w-2 h-2 rounded-full transition-all ${
                  index === currentIndex
                    ? "w-8 bg-accent"
                    : "bg-foreground/20 hover:bg-foreground/40"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
