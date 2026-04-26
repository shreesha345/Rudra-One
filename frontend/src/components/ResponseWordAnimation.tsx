import { useEffect, useState } from "react";

// 22 Official Languages of India - "Response" translations
const responseTranslations = [
  "Response", // English
  "প্ৰতিউত্তৰ", // Assamese
  "প্রতিক্রিয়া", // Bengali
  "हांखो", // Bodo
  "जवाब", // Dogri
  "પ્રતિસાદ", // Gujarati
  "प्रतिक्रिया", // Hindi
  "ಪ್ರತಿಕ್ರಿಯೆ", // Kannada
  "جواب", // Kashmiri
  "प्रतिसाद", // Konkani
  "उत्तर", // Maithili
  "പ്രതികരണം", // Malayalam
  "ꯄ꯭ꯔꯤꯛꯔꯤꯌꯥ", // Manipuri (Meitei)
  "प्रतिसाद", // Marathi
  "प्रतिक्रिया", // Nepali
  "ପ୍ରତିକ୍ରିୟା", // Odia
  "ਜਵਾਬ", // Punjabi
  "प्रत्युत्तरम्", // Sanskrit
  "جواب", // Sindhi
  "பதில்", // Tamil
  "ప్రతిస్పందన", // Telugu
  "جواب" // Urdu
];

export const ResponseWordAnimation = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [typingSpeed, setTypingSpeed] = useState(100);

  useEffect(() => {
    const currentWord = responseTranslations[currentIndex];

    const timeout = setTimeout(() => {
      if (!isDeleting) {
        if (displayedText.length < currentWord.length) {
          setDisplayedText(currentWord.substring(0, displayedText.length + 1));
          setTypingSpeed(80);
        } else {
          setTypingSpeed(1500);
          setIsDeleting(true);
        }
      } else {
        if (displayedText.length > 0) {
          setDisplayedText(currentWord.substring(0, displayedText.length - 1));
          setTypingSpeed(50);
        } else {
          setIsDeleting(false);
          setCurrentIndex((prev) => (prev + 1) % responseTranslations.length);
          setTypingSpeed(300);
        }
      }
    }, typingSpeed);

    return () => clearTimeout(timeout);
  }, [displayedText, isDeleting, currentIndex, typingSpeed]);

  return (
    <span className="inline-block min-w-[200px] text-left">
      {displayedText}
      <span className="animate-pulse">|</span>
    </span>
  );
};
