import { Navigation } from "@/components/Navigation";
import { Hero } from "@/components/Hero";
import { PlatformTabs } from "@/components/PlatformTabs";
import { HowItWorks } from "@/components/HowItWorks";
import { Features } from "@/components/Features";

import { Mission } from "@/components/Mission";

import { FAQ } from "@/components/FAQ";
import { Footer } from "@/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen">
      <Navigation />
      
      {/* Background wrapper for Hero and PlatformTabs */}
      <div 
        className="relative pb-16"
        style={{
          backgroundImage: `url(/home_background-1.webp)`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundAttachment: "fixed"
        }}
      >
        {/* Sand paper texture overlay with golden effect */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `
              radial-gradient(circle at 20% 80%, rgba(218, 165, 32, 0.15) 0%, transparent 50%),
              radial-gradient(circle at 80% 20%, rgba(184, 134, 11, 0.1) 0%, transparent 50%),
              radial-gradient(circle at 40% 40%, rgba(255, 215, 0, 0.08) 0%, transparent 50%),
              linear-gradient(180deg, rgba(0, 0, 0, 0.3) 0%, rgba(0, 0, 0, 0.1) 20%, transparent 40%)
            `,
            backgroundBlendMode: 'multiply',
            filter: 'contrast(1.1) brightness(0.95)',
            mixBlendMode: 'overlay'
          }}
        ></div>
        
        {/* Subtle noise texture for sand paper effect */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-20"
          style={{
            backgroundImage: `
              repeating-linear-gradient(
                45deg,
                transparent,
                transparent 1px,
                rgba(255, 215, 0, 0.03) 1px,
                rgba(255, 215, 0, 0.03) 2px
              ),
              repeating-linear-gradient(
                -45deg,
                transparent,
                transparent 1px,
                rgba(184, 134, 11, 0.02) 1px,
                rgba(184, 134, 11, 0.02) 2px
              )
            `
          }}
        ></div>
        <Hero />
        <PlatformTabs />
      </div>
      
      {/* Dark sections with sand paper texture */}
      <div className="relative">
        {/* Sand paper texture overlay for dark sections */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `
              radial-gradient(circle at 20% 20%, rgba(218, 165, 32, 0.08) 0%, transparent 50%),
              radial-gradient(circle at 80% 80%, rgba(184, 134, 11, 0.06) 0%, transparent 50%),
              radial-gradient(circle at 60% 40%, rgba(255, 215, 0, 0.04) 0%, transparent 50%)
            `,
            backgroundBlendMode: 'multiply',
            filter: 'contrast(1.05) brightness(0.98)',
            mixBlendMode: 'overlay'
          }}
        ></div>
        
        {/* Subtle noise texture for sand paper effect */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-10"
          style={{
            backgroundImage: `
              repeating-linear-gradient(
                45deg,
                transparent,
                transparent 1px,
                rgba(255, 215, 0, 0.02) 1px,
                rgba(255, 215, 0, 0.02) 2px
              ),
              repeating-linear-gradient(
                -45deg,
                transparent,
                transparent 1px,
                rgba(184, 134, 11, 0.015) 1px,
                rgba(184, 134, 11, 0.015) 2px
              )
            `
          }}
        ></div>
        
        <HowItWorks />
        <Features />
        <Mission />
        <FAQ />
        <Footer />
      </div>
    </div>
  );
};

export default Index;
