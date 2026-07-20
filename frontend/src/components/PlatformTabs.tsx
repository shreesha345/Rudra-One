import { useState, useEffect } from "react";

interface TabData {
    id: string;
    title: string;
    subtitle: string;
    description: string;
    image: string;
}

const tabsData: TabData[] = [
    {
        id: "non-emergency",
        title: "Non-Emergency",
        subtitle: "Intelligent Triage",
        description: "Reduce the burden of non-emergency calls, lower call-taker burnout, eliminate backlogs.",
        image: "/67db5afd01a5cbd2bfa701df_01_Triage_illo-p-1080.png"
    },
    {
        id: "calls",
        title: "Emergency Calls",
        subtitle: "Smart Call Handling",
        description: "Faster, more accurate call-taking via streamlined information gathering and seamless translation.",
        image: "/67db5b663e707d67e976a186_02_Calls_illo-p-1080.png"
    },
    {
        id: "dispatch",
        title: "Dispatch Center",
        subtitle: "Coordinated Response",
        description: "Effortlessly monitor every channel to ensure you have information you need, when you need it.",
        image: "/67db5b79595f66059be34f3a_03_Dispatch_illo-p-1080.png"
    },
    {
        id: "qa",
        title: "Quality Assurance",
        subtitle: "Real-time Evaluation",
        description: "Evaluate call-taking quality in real-time for 100% of calls, develop staff faster and retain more personnel.",
        image: "/67db5b87436d156f139df73b_04_QA_illo-p-1080.png"
    }
];

export const PlatformTabs = () => {
    const [activeTab, setActiveTab] = useState("non-emergency");
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setProgress((prev) => {
                if (prev >= 100) {
                    // Move to next tab
                    const currentIndex = tabsData.findIndex(tab => tab.id === activeTab);
                    const nextIndex = (currentIndex + 1) % tabsData.length;
                    setActiveTab(tabsData[nextIndex].id);
                    return 0;
                }
                return prev + 2; // Increase by 2% every 100ms (5 seconds total)
            });
        }, 100);

        return () => clearInterval(interval);
    }, [activeTab]);

    return (
        <section
            className="relative pt-0 pb-8 px-6 overflow-hidden"

        >
            <div className="max-w-[1200px] mx-auto relative z-10">
                {/* Header */}
                <div className="text-left mb-8 max-w-2xl">
                    <div className="text-sm font-medium text-white mb-4 tracking-wider uppercase">
                        END-TO-END
                    </div>
                    <h2 className="text-2xl md:text-3xl lg:text-4xl text-foreground mb-4 font-bold leading-tight">
                        One system, one screen, every phase of emergency response.
                    </h2>
                    <a
                        href="/platform/overview"
                        className="inline-block border border-foreground/30 text-foreground px-8 py-3 rounded-md hover:bg-foreground/10 transition-all duration-300"
                    >
                        Our Platform
                    </a>
                </div>

                {/* Tabs */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                    {/* Tab Navigation */}
                    <div className="space-y-2">
                        {tabsData.map((tab) => (
                            <div
                                key={tab.id}
                                className={`p-4 cursor-pointer transition-all duration-300 relative ${activeTab === tab.id
                                    ? 'bg-foreground/10'
                                    : 'bg-transparent hover:bg-foreground/5'
                                    }`}
                                onClick={() => {
                                    setActiveTab(tab.id);
                                    setProgress(0); // Reset progress when manually clicked
                                }}
                            >
                                <div className="flex items-center justify-between">
                                    <h3 className="text-2xl font-bold text-foreground">
                                        {tab.title}
                                    </h3>
                                    <div className={`text-2xl text-foreground/60 transition-transform duration-300 ${activeTab === tab.id ? 'rotate-45' : ''
                                        }`}>
                                        +
                                    </div>
                                </div>

                                {activeTab === tab.id && (
                                    <div className="mt-3 animate-[fade-in_0.3s_ease-out]">
                                        <p className="text-foreground/75 font-medium leading-relaxed text-base">
                                            {tab.description}
                                        </p>

                                    </div>
                                )}

                                {/* White bottom line for all tabs */}
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/30"></div>
                                
                                {/* Progress bar as bottom border */}
                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-transparent">
                                    {activeTab === tab.id && (
                                        <div
                                            className="h-full bg-red-500 transition-all duration-100 ease-linear"
                                            style={{ width: `${progress}%` }}
                                        ></div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Tab Content */}
                    <div className="relative flex justify-center items-center min-h-[300px]">
                        {tabsData.map((tab) => (
                            <div
                                key={tab.id}
                                className={`absolute inset-0 flex justify-center items-center transition-opacity duration-300 ${activeTab === tab.id
                                    ? 'opacity-100'
                                    : 'opacity-0'
                                    }`}
                            >
                                <img
                                    src={tab.image}
                                    alt={`${tab.title} Interface`}
                                    className="w-full h-auto"
                                    style={{ maxWidth: '1340px' }}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>


        </section>
    );
};