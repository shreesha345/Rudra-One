import { useState } from "react";
import { useNavigate } from "react-router-dom";


export const Login = () => {
    const [agentId, setAgentId] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [showPasswordField, setShowPasswordField] = useState(false);
    const navigate = useNavigate();

    const handleContinue = (e: React.FormEvent) => {
        e.preventDefault();

        if (!agentId.trim()) {
            return;
        }

        setShowPasswordField(true);
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        // Basic validation
        if (!agentId || !password) {
            setIsLoading(false);
            return;
        }

        // Simulate login process
        setTimeout(() => {
            setIsLoading(false);
            // For now, accept any credentials and redirect to dashboard
            navigate("/dashboard");
        }, 1500);
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-white text-lg">Loading RudraOne...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black flex items-center justify-center relative">
            {/* Notice Banner - Top Left */}
            <div className="absolute top-4 left-4 text-gray-300 flex items-start gap-2 border border-gray-600 rounded-md p-2" role="alert">
                {/* Info Icon */}
                <div className="flex-shrink-0 mt-0.5">
                    <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M11,9H13V7H11M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H13V11H11V17Z" />
                    </svg>
                </div>
                {/* Notice Content - Single Lines */}
                <div>
                    <div className="font-semibold text-white mb-1 text-sm">NOTICE:</div>
                    <div className="space-y-1 leading-tight text-xs whitespace-nowrap">
                        <div>1. You are accessing a restricted information system.</div>
                        <div>2. System usage may be monitored, recorded, and subject to audit.</div>
                        <div>3. Unauthorized use of the system is prohibited and subject to criminal and civil penalties.</div>
                        <div>4. Use of the system indicates consent to monitoring and recording during the duration of your session.</div>
                    </div>
                </div>
            </div>

            {/* Main Container - Centered */}
            <div className="flex items-center justify-center w-full max-w-7xl mx-auto px-8">
                {/* Left Side - Logo and Branding */}
                <div className="flex-1 flex flex-col items-center justify-center text-center pr-8">
                    <div className="mb-4">
                        <img
                            src="/apple-touch-icon-removebg-preview.png"
                            alt="RudraOne Logo"
                            className="w-40 h-40 mx-auto mb-2 object-contain"
                        />
                    </div>
                    <h1 className="text-5xl font-bold text-white mb-2">RudraOne</h1>
                </div>

                {/* Right Side - Login Form */}
                <div className="flex-1 flex items-center justify-start ml-16">
                    <div className="w-full max-w-md border border-gray-700 rounded-lg p-8">
                        <form onSubmit={showPasswordField ? handleLogin : handleContinue} className="space-y-6">
                            <h2 className="text-xl font-semibold text-white text-center mb-8">Log In</h2>

                            {/* Agent ID Field */}
                            <div>
                                <label htmlFor="agentId" className="block text-sm font-medium text-gray-400 mb-2">
                                    Agent ID
                                </label>
                                <input
                                    type="text"
                                    id="agentId"
                                    value={agentId}
                                    onChange={(e) => setAgentId(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                                    placeholder=""
                                    required
                                    disabled={showPasswordField}
                                />
                            </div>

                            {/* Password Field - Only show after Agent ID is entered */}
                            {showPasswordField && (
                                <div>
                                    <label htmlFor="password" className="block text-sm font-medium text-gray-400 mb-2">
                                        Password
                                    </label>
                                    <input
                                        type="password"
                                        id="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                                        placeholder=""
                                        required
                                        autoFocus
                                    />
                                    <div className="text-right mt-2">
                                        <a href="#" className="text-sm text-gray-400 hover:text-white transition-colors">
                                            Forgot Password?
                                        </a>
                                    </div>
                                </div>
                            )}

                            {/* Continue/Login Button */}
                            <button
                                type="submit"
                                disabled={(!agentId.trim() && !showPasswordField) || (showPasswordField && (!agentId.trim() || !password.trim()))}
                                className="w-full py-3 px-4 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-md transition-all duration-200 disabled:opacity-50"
                                style={{ backgroundColor: 'rgb(73, 75, 252)' }}
                            >
                                {showPasswordField ? "Login" : "Continue"}
                            </button>
                        </form>

                        {/* Back Button - Only show when password field is visible */}
                        {showPasswordField && (
                            <button
                                onClick={() => {
                                    setShowPasswordField(false);
                                    setPassword("");
                                }}
                                className="w-full mt-4 py-2 text-gray-400 hover:text-white transition-colors text-sm"
                            >
                                ← Back to Agent ID
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-gray-500 text-xs">
                © 2024 RudraOne. All rights reserved.
            </div>
        </div>
    );
};