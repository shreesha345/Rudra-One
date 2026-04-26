
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TypingAnimation } from "./TypingAnimation";
import { ResponseWordAnimation } from "./ResponseWordAnimation";


export const Hero = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [showMobileMessage, setShowMobileMessage] = useState(false);

  const isMobile = () => {
    return window.innerWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  };

  const handleGetStarted = () => {
    if (isMobile()) {
      setShowMobileMessage(true);
      return;
    }
    
    setIsLoading(true);
    // Add a small delay to show the loading screen
    setTimeout(() => {
      navigate("/login");
    }, 1000);
  };

  const closeMobileMessage = () => {
    setShowMobileMessage(false);
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center z-[9999]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white text-lg">Loading RudraOne...</p>
        </div>
      </div>
    );
  }

  if (showMobileMessage) {
    return (
      <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[9999] p-4">
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-sm w-full mx-4 text-center">
          <div className="mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'rgb(146, 67, 36)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-white mb-3">Desktop Only</h3>
          <p className="text-gray-300 mb-6">
            RudraOne login is currently available on desktop devices only. Please access the platform from a desktop or laptop computer.
          </p>
          <button
            onClick={closeMobileMessage}
            className="w-full py-3 px-4 text-white font-medium rounded-md transition-all duration-200 hover:opacity-90"
            style={{ background: 'linear-gradient(200deg, rgb(52, 0, 1) 34%, rgb(146, 67, 36) 100%)' }}
          >
            Got It
          </button>
        </div>
      </div>
    );
  }

  return (
    <section
      className="relative min-h-screen flex items-center justify-center pt-20 pb-12 px-6 overflow-hidden"

    >
      {/* Content */}
      <div className="max-w-[1200px] w-full mx-auto relative z-10">
        <div className="text-center space-y-8 animate-[fade-in_0.8s_ease-out]">
          {/* Headline */}
          <div className="mt-16">
            <h1 className="text-foreground font-normal hero-title mb-2">
              RudraOne — AI Emergency
            </h1>
            <h1 className="text-foreground font-normal hero-title mt-4">
              Intelligence & <ResponseWordAnimation />
            </h1>
          </div>

          {/* Subheadline */}
          <TypingAnimation />

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
            <button
              onClick={handleGetStarted}
              className="text-white bg-transparent hover:bg-transparent transition-all duration-300 get-started-btn"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                visibility: 'visible',
                position: 'static',
                width: '140px',
                height: '42px',
                color: 'rgb(255, 255, 255)',
                backgroundColor: 'rgba(0, 0, 0, 0)',
                border: '1px solid rgb(248, 244, 241)',
                padding: '12px 24px',
                margin: '0px',
                fontSize: '16px',
                fontWeight: '500',
                textDecoration: 'none',
                borderRadius: '4px',
                whiteSpace: 'nowrap'
              }}
            >
              Get Started
            </button>
            <button
              className="text-white transition-all duration-300 request-demo-hero-btn"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(200deg, rgb(52, 0, 1) 34%, rgb(146, 67, 36) 100%)',
                boxSizing: 'border-box',
                padding: '12px 24px',
                border: '0px',
                borderRadius: '4px',
                width: '153.25px',
                height: '42.1333px',
                fontSize: '16px',
                fontWeight: '500',
                color: 'rgb(255, 255, 255)',
                whiteSpace: 'nowrap'
              }}
            >
              Request Demo
            </button>
          </div>



        </div>
      </div>



    </section>
  );
};
