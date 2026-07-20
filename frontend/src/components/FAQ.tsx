import { GlassCard } from "./GlassCard";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "How secure is RudraOne?",
    answer:
      "RudraOne employs enterprise-grade encryption, multi-factor authentication, and complies with FedRAMP, SOC 2, and GDPR standards. All data is encrypted at rest and in transit, with regular security audits conducted by third-party firms.",
  },
  {
    question: "Can we integrate our legacy dispatch systems?",
    answer:
      "Yes, RudraOne provides secure adapters for most major dispatch and CAD systems. Our integration team will work with you to ensure seamless connectivity with your existing infrastructure.",
  },
  {
    question: "What's the SLA for enterprise customers?",
    answer:
      "Enterprise customers receive custom SLA agreements tailored to their operational requirements, including guaranteed uptime (up to 99.99%), response times, and dedicated support channels.",
  },
  {
    question: "How does the AI detection work?",
    answer:
      "Our AI uses advanced machine learning models trained on emergency response patterns. The system continuously learns from your environment, adapting to reduce false positives while maintaining high detection accuracy.",
  },
  {
    question: "What kind of support do you provide?",
    answer:
      "Free tier includes email support. Pro customers get priority support with 24-hour response times. Enterprise customers receive 24/7 phone support, a dedicated account manager, and direct access to our engineering team.",
  },
];

export const FAQ = () => {
  return (
    <section id="faq" className="py-24 px-6 bg-background/50">
      <div className="max-w-[900px] mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-foreground mb-4">Frequently Asked Questions</h2>
          <p className="text-lg text-foreground/65 font-light">
            Common questions about RudraOne
          </p>
        </div>

        <GlassCard>
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`}>
                <AccordionTrigger className="text-left text-foreground font-light hover:text-foreground/80">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-foreground/65 font-light leading-relaxed">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </GlassCard>
      </div>
    </section>
  );
};
