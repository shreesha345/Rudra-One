import { Link } from "react-router-dom";
import { Mail, Linkedin, Twitter, Github } from "lucide-react";

export const Footer = () => {
  return (
    <footer className="relative border-t border-white/[0.06] bg-background/95 backdrop-blur-xl">
      <div className="max-w-[1200px] mx-auto px-6 py-16">
        <div className="grid md:grid-cols-4 gap-12">
          {/* Brand */}
          <div>
            <h3 className="text-2xl font-light tracking-tight mb-4">RudraOne</h3>
            <p className="text-sm text-foreground/60 font-light leading-relaxed">
              Enterprise AI for emergency intelligence and response.
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-sm font-light tracking-widest uppercase text-foreground/80 mb-4">
              Product
            </h4>
            <ul className="space-y-3">
              <li>
                <a href="/#features" className="text-sm text-foreground/60 hover:text-foreground transition-colors font-light">
                  Features
                </a>
              </li>
              <li>
                <a href="/#pricing" className="text-sm text-foreground/60 hover:text-foreground transition-colors font-light">
                  Pricing
                </a>
              </li>
              <li>
                <Link to="/about" className="text-sm text-foreground/60 hover:text-foreground transition-colors font-light">
                  About
                </Link>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-sm font-light tracking-widest uppercase text-foreground/80 mb-4">
              Resources
            </h4>
            <ul className="space-y-3">
              <li>
                <Link to="/blog" className="text-sm text-foreground/60 hover:text-foreground transition-colors font-light">
                  Blog
                </Link>
              </li>
              <li>
                <a href="/#faq" className="text-sm text-foreground/60 hover:text-foreground transition-colors font-light">
                  FAQ
                </a>
              </li>
              <li>
                <Link to="/contact" className="text-sm text-foreground/60 hover:text-foreground transition-colors font-light">
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-sm font-light tracking-widest uppercase text-foreground/80 mb-4">
              Connect
            </h4>
            <div className="space-y-3">
              <a
                href="mailto:contact@rudraone.com"
                className="text-sm text-foreground/60 hover:text-foreground transition-colors font-light flex items-center gap-2"
              >
                <Mail className="w-4 h-4" />
                contact@rudraone.com
              </a>
              <div className="flex gap-4 pt-2">
                <a href="#" className="text-foreground/60 hover:text-foreground transition-colors">
                  <Linkedin className="w-5 h-5" strokeWidth={1.5} />
                </a>
                <a href="#" className="text-foreground/60 hover:text-foreground transition-colors">
                  <Twitter className="w-5 h-5" strokeWidth={1.5} />
                </a>
                <a href="#" className="text-foreground/60 hover:text-foreground transition-colors">
                  <Github className="w-5 h-5" strokeWidth={1.5} />
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-16 pt-8 border-t border-white/[0.06] flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-foreground/45 font-light">
            © 2025 RudraOne. All rights reserved.
          </p>
          <div className="flex gap-6">
            <a href="#" className="text-sm text-foreground/45 hover:text-foreground/60 transition-colors font-light">
              Privacy Policy
            </a>
            <a href="#" className="text-sm text-foreground/45 hover:text-foreground/60 transition-colors font-light">
              Terms of Service
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
