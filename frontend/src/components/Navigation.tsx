import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

const platformItems = [
  {
    name: "End-to-End Overview",
    href: "/platform/overview",
    description: "One system, one screen, every phase of emergency response.",
    image: "/platform-overview-icon.svg"
  },
  {
    name: "Non-Emergency",
    href: "/platform/non-emergency",
    description: "Reduce the burden of non-emergency calls, lower call-taker burnout, eliminate backlogs.",
    image: "/platform-non-emergency-icon.svg"
  },
  {
    name: "Calls",
    href: "/platform/calls",
    description: "Faster, more accurate call-taking via streamlined information gathering and seamless translation.",
    image: "/platform-calls-icon.svg"
  },
  {
    name: "Dispatch",
    href: "/platform/dispatch",
    description: "Effortlessly monitor every channel and link groups to ensure you have the information you need, when you need it.",
    image: "/platform-dispatch-icon.svg"
  },
  {
    name: "QA",
    href: "/platform/qa",
    description: "Evaluate call-taking quality in real-time for 100% of calls to develop staff faster and retain more personnel.",
    image: "/platform-qa-icon.svg"
  }
];

const navLinks = [
  {
    name: "Platform",
    href: "#",
    hasDropdown: true,
    isMegaMenu: true,
    dropdownItems: []
  },
  {
    name: "Solutions",
    href: "#",
    hasDropdown: true,
    dropdownItems: [
      { name: "112 Emergency Services", href: "/solutions/112" },
      { name: "Police Response", href: "/solutions/police" },
      { name: "Fire & Rescue", href: "/solutions/fire-rescue" },
      { name: "Medical Emergency", href: "/solutions/medical" },
      { name: "Disaster Management", href: "/solutions/disaster" },
      { name: "Multi-language Support", href: "/solutions/translation" },
    ]
  },
  {
    name: "Resources",
    href: "#",
    hasDropdown: true,
    dropdownItems: [
      { name: "Case Studies", href: "/resources/case-studies" },
      { name: "Videos", href: "/resources/videos" },
      { name: "Blog", href: "/resources/blog" },
      { name: "Webinars", href: "/resources/webinars" },
      { name: "News", href: "/resources/news" },
    ]
  },
  {
    name: "About",
    href: "#",
    hasDropdown: true,
    dropdownItems: [
      { name: "About Us", href: "/company" },
      { name: "Careers", href: "/careers" },
      { name: "Contact", href: "/contact" },
      { name: "Trust & Security", href: "/trust" },
    ]
  },
];

export const Navigation = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [isNavHovered, setIsNavHovered] = useState(false);
  const [isPlatformSticky, setIsPlatformSticky] = useState(false);
  const [hoveredMenuItem, setHoveredMenuItem] = useState<string | null>(null);
  const [hoverTimeout, setHoverTimeout] = useState<NodeJS.Timeout | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showMobileMessage, setShowMobileMessage] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const isMobile = () => {
    return window.innerWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  };

  const handleLoginClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsMobileMenuOpen(false); // Close mobile menu if open

    if (isMobile()) {
      setShowMobileMessage(true);
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      navigate("/login");
    }, 1000);
  };

  const closeMobileMessage = () => {
    setShowMobileMessage(false);
  };

  // Auto-close mega menu when mouse moves far from navbar
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (activeDropdown === 'Platform') {
        // Check if mouse is too far from the top of the page (navbar area)
        const distanceFromTop = e.clientY;
        const maxDistance = 400; // Adjust this value as needed

        if (distanceFromTop > maxDistance) {
          setActiveDropdown(null);
          setIsPlatformSticky(false);
          setIsNavHovered(false); // Reset navbar appearance when moving far away
        }
      } else if (isNavHovered && !activeDropdown) {
        // If navbar is hovered but no dropdown is active, check if mouse is still in navbar area
        const distanceFromTop = e.clientY;
        const navbarHeight = 80; // Approximate navbar height

        if (distanceFromTop > navbarHeight) {
          setIsNavHovered(false);
        }
      }
    };

    if (activeDropdown === 'Platform' || isNavHovered) {
      document.addEventListener('mousemove', handleMouseMove);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [activeDropdown, isNavHovered]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
      }
    };
  }, [hoverTimeout]);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isNavHovered
          ? 'bg-white/95 backdrop-blur-md text-black border-b-2 border-black'
          : 'bg-white/10 backdrop-blur-md text-white border-b border-white/10'
          }`}
        onMouseEnter={() => setIsNavHovered(true)}
        onMouseLeave={() => {
          // Only reset nav hover if no dropdown is active
          if (!activeDropdown) {
            setIsNavHovered(false);
          }
        }}
      >
        <div className="max-w-[1400px] mx-auto px-6 md:px-12">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2">
              <span
                className={`text-3xl font-bold transition-colors nav-logo ${isNavHovered ? 'text-black' : 'text-white'}`}
              >
                RudraOne
              </span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center gap-8">
              {navLinks.map((link) => (
                <div
                  key={link.name}
                  className="relative"
                  onMouseEnter={() => {
                    if (link.hasDropdown && !isPlatformSticky) {
                      setActiveDropdown(link.name);
                    }
                  }}
                  onMouseLeave={() => {
                    if (!isPlatformSticky && link.name !== 'Platform') {
                      setActiveDropdown(null);
                      // Reset navbar appearance for non-platform dropdowns
                      if (!activeDropdown || activeDropdown !== 'Platform') {
                        setIsNavHovered(false);
                      }
                    } else if (link.name === 'Platform' && !isPlatformSticky) {
                      // Add a small delay before closing the platform menu
                      const timeout = setTimeout(() => {
                        setActiveDropdown(null);
                        setIsNavHovered(false); // Reset navbar appearance when menu closes
                      }, 150);
                      setHoverTimeout(timeout);
                    }
                  }}
                >
                  <button
                    className={`flex items-center gap-1 text-sm font-medium transition-colors nav-link ${isNavHovered
                      ? 'text-black/90 hover:text-black'
                      : 'text-white/90 hover:text-white'
                      }`}
                    onClick={() => {
                      if (link.name === 'Platform') {
                        if (isPlatformSticky) {
                          // If sticky, turn off sticky mode and close dropdown
                          setIsPlatformSticky(false);
                          setActiveDropdown(null);
                        } else {
                          // If not sticky, make it sticky and open dropdown
                          setIsPlatformSticky(true);
                          setActiveDropdown('Platform');
                        }
                      }
                    }}
                  >
                    {link.name}
                    {link.hasDropdown && <ChevronDown className="w-4 h-4" />}
                  </button>

                  {/* Regular Dropdown Menu (non-Platform items) */}
                  {link.hasDropdown && activeDropdown === link.name && !link.isMegaMenu && (
                    <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50">
                      {link.dropdownItems?.map((item) => (
                        <a
                          key={item.name}
                          href={item.href}
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-[#B8713C] transition-colors"
                        >
                          {item.name}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              <div className="flex items-center gap-3 ml-4">
                <button
                  onClick={handleLoginClick}
                  className={`text-sm font-medium transition-all duration-200 inline-block ${isNavHovered
                    ? 'border border-black text-black hover:bg-black hover:text-white'
                    : 'border border-white text-white hover:bg-white hover:text-black'
                    }`}
                  style={{
                    paddingTop: '5px',
                    paddingBottom: '5px',
                    paddingLeft: '24px',
                    paddingRight: '24px',
                    borderRadius: '4px'
                  }}
                >
                  Login
                </button>
                <button
                  className="text-white text-sm font-medium transition-all duration-200 hover:shadow-lg hover:scale-105 get-in-touch-btn"
                  style={{
                    background: 'linear-gradient(200deg, rgb(52, 0, 1) 34%, rgb(146, 67, 36) 100%)',
                    paddingTop: '5px',
                    paddingBottom: '5px',
                    paddingLeft: '24px',
                    paddingRight: '24px',
                    borderRadius: '4px'
                  }}
                >
                  Get in Touch
                </button>
              </div>
            </div>

            {/* Mobile Menu Button */}
            <button
              className={`lg:hidden p-2 transition-colors ${isNavHovered ? 'text-black' : 'text-white'
                }`}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>

        {/* Platform Mega Menu - Outside navbar */}
        {activeDropdown === 'Platform' && (
          <div
            className="absolute top-full left-0 right-0 shadow-xl z-40 platform-mega-menu"
            onMouseEnter={() => {
              // Clear any pending timeout when entering the menu
              if (hoverTimeout) {
                clearTimeout(hoverTimeout);
                setHoverTimeout(null);
              }
              setActiveDropdown('Platform');
            }}
            onMouseLeave={() => {
              if (!isPlatformSticky) {
                // Add a small delay before closing when leaving the menu
                const timeout = setTimeout(() => {
                  setActiveDropdown(null);
                  setIsNavHovered(false); // Reset navbar appearance when menu closes
                }, 100);
                setHoverTimeout(timeout);
              }
            }}
          >
            <div className="max-w-[1200px] mx-auto px-10 pt-10 pb-10">
              <div className="flex gap-10 items-stretch min-h-full relative">
                {/* Left Column - Overview */}
                <div className="flex-1 max-w-sm">
                  <div className="platform-section-label">
                    THE PLATFORM
                  </div>
                  <div
                    className="platform-card"
                    onMouseEnter={() => setHoveredMenuItem(platformItems[0].name)}
                    onMouseLeave={() => setHoveredMenuItem(null)}
                  >
                    <Link to={platformItems[0].href} className="block">
                      <h3 style={{
                        color: hoveredMenuItem === platformItems[0].name ? '#FF4C1D' : '#111111',
                        transition: 'color 0.2s ease'
                      }}>
                        {platformItems[0].name}
                      </h3>
                      <p>
                        {platformItems[0].description}
                      </p>
                      <div className="flex justify-center mt-4">
                        <div className="platform-icon">
                          <img
                            src={platformItems[0].image}
                            alt={platformItems[0].name}
                            className="w-full h-full object-contain"

                          />
                        </div>
                      </div>
                    </Link>
                  </div>
                </div>

                {/* Vertical Divider */}
                <div className="flex items-stretch absolute-divider">
                  <div className="platform-divider"></div>
                </div>

                {/* Right Section - Grid of 4 items */}
                <div className="flex-1">
                  <div className="platform-section-label">
                    END-TO-END
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {platformItems.slice(1).map((item) => (
                      <div
                        key={item.name}
                        className="platform-card platform-card-small"
                        style={{ padding: '16px' }}
                        onMouseEnter={() => setHoveredMenuItem(item.name)}
                        onMouseLeave={() => setHoveredMenuItem(null)}
                      >
                        <Link to={item.href} className="block">
                          <h4 style={{
                            color: hoveredMenuItem === item.name ? '#FF4C1D' : '#111111',
                            transition: 'color 0.2s ease'
                          }}>
                            {item.name}
                          </h4>
                          <p>
                            {item.description}
                          </p>
                          <div className="flex justify-center mt-3">
                            <div className="platform-icon platform-icon-small">
                              <img
                                src={item.image}
                                alt={item.name}
                                className="w-full h-full object-contain"

                              />
                            </div>
                          </div>
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Mobile Menu Tray */}
      <div
        className={`fixed top-0 right-0 bottom-0 w-80 bg-[#B8713C] z-50 transform transition-transform duration-300 lg:hidden ${isMobileMenuOpen ? "translate-x-0" : "translate-x-full"
          }`}
      >
        <div className="p-8">
          <button
            className="absolute top-6 right-6 p-2 text-white"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <X className="w-6 h-6" />
          </button>

          <div className="flex flex-col gap-6 mt-16">
            {navLinks.map((link) => (
              <div key={link.name} className="space-y-2">
                <div className="text-lg font-medium text-white">
                  {link.name}
                </div>
                {link.dropdownItems && (
                  <div className="ml-4 space-y-2">
                    {link.dropdownItems.map((item) => (
                      <a
                        key={item.name}
                        href={item.href}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="block text-sm text-white/80 hover:text-white transition-colors"
                      >
                        {item.name}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div className="mt-8 flex flex-col gap-4">
              <button
                onClick={handleLoginClick}
                className="border-2 border-white text-white px-6 py-3 rounded-md text-sm font-medium hover:bg-white hover:text-[#B8713C] transition-all duration-200 text-center"
              >
                Login
              </button>
              <button
                className="text-white px-6 py-3 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
                style={{
                  background: 'linear-gradient(200deg, rgb(52, 0, 1) 34%, rgb(146, 67, 36) 100%)'
                }}
              >
                Get in Touch
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
