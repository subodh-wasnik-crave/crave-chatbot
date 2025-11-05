import React from "react";

import {
    Send,
    Loader2,
    Menu,
    X,
    Paperclip,
    Plus,
    Sparkles,
    Database,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";

// ⬇️ === IMPORTANT: REPLACE WITH YOUR SUPABASE DETAILS === ⬇️
// Find these in your Supabase project: Settings > API
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
// ⬆️ === IMPORTANT: REPLACE WITH YOUR SUPABASE DETAILS === ⬆️

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// === N8N WEBHOOKS ===
const N8N_CHAT_WEBHOOK_URL = import.meta.env.VITE_N8N_CHAT_WEBHOOK_URL;
const N8N_UPLOAD_WEBHOOK_URL = import.meta.env.VITE_N8N_UPLOAD_WEBHOOK_URL;

// === HELPER FUNCTIONS ===

/**
 * Simple markdown to HTML converter
 */
function formatMarkdownToHtml(text) {
    if (!text) return "";
    return text
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.*?)\*/g, "<em>$1</em>")
        .replace(/\n/g, "<br>");
}

function parseN8nResponse(data) {
    let aiText = "No response.";
    let aiSources = [];
    if (Array.isArray(data) && data.length > 0 && data[0].output) {
        if (data[0].output.answer) aiText = data[0].output.answer;
        if (data[0].output.sources) aiSources = data[0].output.sources;
    } else if (data.output && data.output.answer) {
        aiText = data.output.answer;
        aiSources = data.output.sources;
    } else if (Array.isArray(data) && typeof data[0].output === "string") {
        aiText = data[0].output;
    } else if (data.output && typeof data.output === "string") {
        aiText = data.output;
    } else if (data.reply || data.text) {
        aiText = data.reply || data.text;
    }
    return { answer: aiText, sources: aiSources };
}

// === WELCOME MESSAGE ===
const WELCOME_MESSAGE = {
    id: "welcome",
    sender: "ai",
    message:
        "Please upload a document to get started! You can then ask questions related to its content.",
    sources: [],
};

// === SUB-COMPONENTS ===

/**
 * A single chat message bubble
 */
const ChatMessage = ({ message }) => {
    const isUser = message.sender === "user";
    const isSystem = message.sender === "system";

    if (isSystem) {
        return (
            <div className="flex justify-center w-full">
                <div className="p-3 rounded-lg bg-gray-600 text-gray-200 italic text-sm max-w-lg w-full text-center shadow-md">
                    {message.message}
                </div>
            </div>
        );
    }

    return (
        <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
            <div
                className={`flex items-start space-x-3 max-w-xs sm:max-w-md md:max-w-lg ${
                    isUser ? "flex-row-reverse space-x-reverse" : ""
                }`}
            >
                {!isUser && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center shadow-inner">
                        <Sparkles className="w-5 h-5 text-blue-400" />
                    </div>
                )}
                <div
                    className={`p-3 rounded-lg break-words shadow-md ${
                        isUser
                            ? "bg-blue-600 text-white rounded-br-none"
                            : "bg-gray-700 text-gray-100 rounded-bl-none"
                    }`}
                >
                    {/* Render message text as HTML */}
                    <div
                        dangerouslySetInnerHTML={{
                            __html: formatMarkdownToHtml(message.message),
                        }}
                    />

                    {/* Render sources if they exist */}
                    {message.sources && message.sources.length > 0 && (
                        <div className="mt-3 pt-2 border-t border-gray-600/50">
                            <h4 className="text-xs font-semibold mb-2 text-gray-300 flex items-center">
                                <Database className="w-3 h-3 mr-1" />
                                Sources:
                            </h4>
                            <div className="flex flex-wrap gap-2">
                                {message.sources.map((source, idx) => (
                                    <span
                                        key={idx}
                                        className="text-xs text-gray-400 font-mono bg-gray-800 px-2 py-1 rounded-full"
                                    >
                                        {source}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

/**
 * AI Typing Indicator
 */
const TypingIndicator = () => (
    <div className="flex justify-start">
        <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center shadow-inner">
                <Sparkles className="w-5 h-5 text-blue-400" />
            </div>
            <div className="p-3 rounded-lg bg-gray-700 text-gray-100 rounded-bl-none shadow-md">
                <div className="flex space-x-1.5">
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                </div>
            </div>
        </div>
    </div>
);

/**
 * Main App Component
 */
export default function App() {
    // === STATE MANAGEMENT ===
    // React and its hooks (useState, useRef, useEffect) are provided by the environment.
    const [messages, setMessages] = React.useState([WELCOME_MESSAGE]);
    const [currentMessage, setCurrentMessage] = React.useState("");

    // 'idle' | 'loading' | 'thinking' | 'uploading'
    const [chatStatus, setChatStatus] = React.useState("idle");

    const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
    const [currentSessionID, setCurrentSessionID] = React.useState(null);
    const [allSessions, setAllSessions] = React.useState([]);
    const [error, setError] = React.useState(null);

    const chatEndRef = React.useRef(null);

    // === EFFECTS ===

    // Scroll to bottom of chat
    React.useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // (Inside your App component, near your other useState hooks)
    const [isInitializing, setIsInitializing] = React.useState(true);
    
    // ⬇️ ADD THIS ⬇️
    // This new useEffect replaces your old one
    React.useEffect(() => {
        const initializeApp = async () => {
            setIsInitializing(true);
            const sessions = await fetchSessions(); // Call your modified function
    
            if (sessions && sessions.length > 0) {
                // Sessions exist. Select the most recent one.
                // handleSelectChat() will set the session ID and fetch its messages.
                handleSelectChat(sessions[0].id);
            } else if (sessions) {
                // No sessions exist (sessions is an empty array), so create one.
                // handleNewChat() will create, refresh the list, and set the new ID.
                await handleNewChat();
            }
            // If sessions is null (an error), the error is already set by fetchSessions.
            setIsInitializing(false);
        };
    
        initializeApp();
    }, []); // <-- Empty array means this runs only ONCE on mount

    // === DATA FETCHING ===

    /**
     * Fetches all messages for a given session ID from Supabase
     */
    const fetchMessages = async (sessionID) => {
        if (!sessionID) return;
        setChatStatus("loading");
        setMessages([]);
        try {
            const { data, error } = await supabase
                .from("chat_history")
                .select("*")
                .eq("session_id", sessionID)
                .order("created_at", { ascending: true });
            if (error) throw error;
            setMessages(data.length ? data : [WELCOME_MESSAGE]);
        } catch (err) {
            setError("Error fetching chat history: " + err.message);
            setMessages([WELCOME_MESSAGE]);
        } finally {
            setChatStatus("idle");
        }
    };

    const sessionsArray = Array.isArray(allSessions) ? allSessions : [];
    const sortedSessions = sessionsArray.slice().sort((a, b) => {
        if (a.title === "New Chat") return -1;
        if (b.title === "New Chat") return 1;
        return new Date(b.updated_at) - new Date(a.updated_at);
    });

    // === CHAT HANDLERS ===
    // This is your modified function
    async function fetchSessions() {
        const { data, error } = await supabase
            .from("chat_sessions")
            .select("*")
            .order("updated_at", { ascending: false });
    
        if (error) {
            setError(error.message);
            setAllSessions([]); // Ensure it's an array on error
            return null; // <-- ADD THIS
        } else {
            // Fix here: ensure allSessions is always an array
            const sessions = Array.isArray(data) ? data : [];
            setAllSessions(sessions);
            return sessions; // <-- ADD THIS
        }
    }

    /**
     * Starts a new chat session
     */
    const handleNewChat = async () => {
        const { data, error } = await supabase
            .from("chat_sessions")
            .insert({ title: "New Chat" })
            .select()
            .single();
        if (error) setError(error.message);
        else {
            await fetchSessions(); // <-- Refresh the session list so sidebar updates
            setCurrentSessionID(data.id); // <-- Switch to new chat immediately
            setMessages([WELCOME_MESSAGE]);
        }
    };

    /**
     * Loads a selected chat session
     */
    function handleSelectChat(sessionID) {
        setCurrentSessionID(sessionID);
        setIsSidebarOpen(false);
        setError(null);
        fetchMessages(sessionID);
    }

    /**
     * Sends a chat message to the n8n Chatbot workflow.
     */
    async function handleSendMessage(e) {
        e.preventDefault();
        if (!currentSessionID || chatStatus !== "idle") return;
        const trimmed = currentMessage.trim();
        if (!trimmed) return;

        setChatStatus("thinking");
        setMessages((prev) => [
            ...prev,
            {
                id: `user-${Date.now()}`,
                sender: "user",
                message: trimmed,
                sources: [],
            },
        ]);
        setCurrentMessage("");

        // Save user message in Supabase
        await supabase.from("chat_history").insert({
            session_id: currentSessionID,
            sender: "user",
            message: trimmed,
            sources: [],
        });

        // Request AI response from n8n
        try {
            const response = await fetch(N8N_CHAT_WEBHOOK_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: trimmed,
                    session_id: currentSessionID,
                }),
            });
            if (!response.ok)
                throw new Error(`n8n error: ${response.statusText}`);
            const respData = await response.json();

            const { answer, sources } = parseN8nResponse(respData);

            const aiMsg = {
                id: `ai-${Date.now()}`,
                sender: "ai",
                message: answer,
                sources,
            };

            setMessages((prev) => [...prev, aiMsg]);
            await supabase.from("chat_history").insert({
                session_id: currentSessionID,
                sender: "ai",
                message: answer,
                sources,
            });

            // Optional: Update session title after first message
            const session = allSessions.find(
                (s) => s.id === currentSessionID && s.title === "New Chat"
            );
            if (session && trimmed.length > 0) {
                const newTitle = trimmed.slice(0, 40);
                await supabase
                    .from("chat_sessions")
                    .update({ title: newTitle })
                    .eq("id", currentSessionID);
                await fetchSessions();
            }
        } catch (err) {
            setError("Chat error: " + err.message);
            setMessages((prev) => [
                ...prev,
                {
                    id: `err-${Date.now()}`,
                    sender: "system",
                    message: `Error: ${err.message}`,
                    sources: [],
                },
            ]);
        } finally {
            setChatStatus("idle");
        }
    }

    /**
     * Handles selecting a file and immediately uploading it.
     */
    async function handleFileChange(e) {
        const file = e.target.files[0];
        if (!file || !currentSessionID || chatStatus !== "idle") return;
        setMessages((prev) => [
            ...prev,
            {
                id: `sys-${Date.now()}`,
                sender: "system",
                message: `Uploading ${file.name}...`,
                sources: [],
            },
        ]);
        setChatStatus("uploading");

        const formData = new FormData();
        formData.append("file", file);
        formData.append("session_id", currentSessionID);

        try {
            const response = await fetch(N8N_UPLOAD_WEBHOOK_URL, {
                method: "POST",
                body: formData,
            });
            if (response.ok) {
                setMessages((prev) => [
                    ...prev,
                    {
                        id: `sys-${Date.now()}`,
                        sender: "system",
                        message:
                            "File uploaded successfully! Now you can chat with context from this doc.",
                        sources: [],
                    },
                ]);
            } else {
                throw new Error(
                    `Server responded with status ${response.status}`
                );
            }
        } catch (err) {
            setMessages((prev) => [
                ...prev,
                {
                    id: `err-${Date.now()}`,
                    sender: "system",
                    message: `Upload failed: ${err.message}`,
                    sources: [],
                },
            ]);
        } finally {
            setChatStatus("idle");
            e.target.value = null;
        }
    }

    // === MAIN RENDER ===

    return (
        <div className="flex h-screen w-screen bg-gray-800 text-gray-100 font-sans overflow-hidden">
            {/* Inline styles for custom scrollbar and animations */}
            <style>{`
          .custom-scrollbar::-webkit-scrollbar { width: 8px; }
          .custom-scrollbar::-webkit-scrollbar-track { background: #1f2937; }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: #4b5563; border-radius: 4px; }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #6b7280; }
          .animate-bounce {
            animation: bounce 1s infinite;
          }
          @keyframes bounce {
            0%, 100% { transform: translateY(-25%); animation-timing-function: cubic-bezier(0.8, 0, 1, 1); }
            50% { transform: translateY(0); animation-timing-function: cubic-bezier(0, 0, 0.2, 1); }
          }
        `}</style>

            {/* --- Sidebar --- */}
            <aside
                className={`absolute z-30 inset-y-0 left-0 w-72 bg-gray-900 shadow-xl transform transition-transform duration-300 ease-in-out ${
                    isSidebarOpen ? "translate-x-0" : "-translate-x-full"
                } md:relative md:translate-x-0 md:flex md:flex-col flex-shrink-0`}
            >
                <div className="flex items-center justify-between p-4 border-b border-gray-700/50">
                    <h2 className="text-lg font-semibold text-white">
                        Chat History
                    </h2>
                    <button
                        onClick={handleNewChat}
                        className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg"
                        title="Start New Chat"
                    >
                        <Plus className="h-5 w-5" />
                    </button>
                    <button
                        onClick={() => setIsSidebarOpen(false)}
                        className="text-gray-400 hover:text-white md:hidden"
                    >
                        <X className="h-6 w-6" />
                    </button>
                </div>

                <div className="flex-1 p-4 overflow-y-auto custom-scrollbar space-y-2">
                    {sortedSessions.length > 0 ? (
                        <ul className="space-y-2">
                            {sortedSessions.map((session) => (
                                <li key={session.id}>
                                    <button
                                        onClick={() =>
                                            handleSelectChat(session.id)
                                        }
                                        className={`w-full text-left p-3 rounded-lg truncate ${
                                            session.id === currentSessionID
                                                ? "bg-blue-600 text-white shadow-md"
                                                : "text-gray-300 hover:bg-gray-700/50 hover:text-white"
                                        } transition-all duration-200`}
                                        title={
                                            session.title === "New Chat"
                                                ? session.id
                                                : session.title
                                        }
                                    >
                                        {session.title === "New Chat"
                                            ? session.id
                                            : session.title}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-gray-500 text-sm p-4 text-center">
                            Your chat history will appear here.
                        </p>
                    )}
                </div>
            </aside>

            {/* --- Overlay for Mobile (closes sidebar on click) --- */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/60 z-20 md:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                ></div>
            )}

            {/* --- Main Content (Header + Chat + Input) --- */}
            <main className="flex-1 flex flex-col h-screen bg-gray-800">
                {/* Header */}
                <header className="flex items-center justify-between p-4 bg-gray-900 border-b border-gray-700/50 shadow-md z-10">
                    <button
                        onClick={() => setIsSidebarOpen(true)}
                        className="text-gray-300 hover:text-white md:hidden"
                    >
                        <Menu className="h-6 w-6" />
                    </button>
                    {/* <h1 className="text-xl font-semibold text-white md:hidden">
              {allSessions[currentSessionID] || 'Chat'}
            </h1> */}
                    <div className="hidden md:block">
                        {/* Desktop header content can go here */}
                        <h1 className="text-xl font-semibold text-white">
                            {/* {allSessions[currentSessionID] || 'Chat'} */}
                        </h1>
                    </div>
                </header>

                {/* Chat Message Area */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    <div className="max-w-5xl mx-auto flex flex-col space-y-4">
                        {/* Critical Error Display */}
                        {chatStatus === "error" && error && (
                            <div className="p-4 rounded-lg bg-red-800/50 border border-red-700 text-red-100">
                                <h4 className="font-bold mb-2">
                                    A critical error occurred:
                                </h4>
                                <p className="text-sm">{error}</p>
                            </div>
                        )}

                        {/* Chat messages */}
                        {messages.map((msg, index) => (
                            <ChatMessage key={msg.id || index} message={msg} />
                        ))}

                        {/* "Thinking/Uploading" indicator */}
                        {chatStatus === "thinking" && <TypingIndicator />}

                        {chatStatus === "uploading" && (
                            <div className="flex justify-start">
                                <div className="p-3 rounded-lg bg-gray-700 text-gray-100 rounded-bl-none flex items-center space-x-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span className="text-sm italic">
                                        Uploading file...
                                    </span>
                                </div>
                            </div>
                        )}

                        {chatStatus === "loading" && (
                            <div className="flex justify-center p-8">
                                <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
                            </div>
                        )}

                        <div ref={chatEndRef} />
                    </div>
                </div>

                {/* Chat Input Area */}
                <div className="p-4 bg-gray-900 border-t border-gray-700/50 shadow-inner">
                    <form
                        onSubmit={handleSendMessage}
                        className="flex items-center space-x-3 max-w-3xl mx-auto"
                    >
                        {/* File Upload Button */}
                        <label
                            htmlFor="file-upload"
                            className={`flex-shrink-0 p-3 rounded-full text-gray-400 transition-all duration-200 ${
                                chatStatus !== "idle"
                                    ? "opacity-50 cursor-not-allowed"
                                    : "hover:text-white hover:bg-gray-700 cursor-pointer"
                            }`}
                        >
                            <Paperclip className="h-5 w-5" />
                        </label>
                        <input
                            id="file-upload"
                            type="file"
                            className="hidden"
                            onChange={handleFileChange}
                            disabled={chatStatus !== "idle"}
                        />

                        {/* Text Input */}
                        <input
                            type="text"
                            value={currentMessage}
                            onChange={(e) => setCurrentMessage(e.target.value)}
                            placeholder="Type your message..."
                            className="flex-1 p-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            disabled={chatStatus !== "idle"}
                        />

                        {/* Send Button */}
                        <button
                            type="submit"
                            className="flex-shrink-0 bg-blue-600 text-white p-3 rounded-full font-medium transition-all duration-200 hover:bg-blue-700 hover:scale-105 disabled:bg-gray-600 disabled:hover:scale-100"
                            disabled={!currentMessage || chatStatus !== "idle"}
                        >
                            <Send className="h-5 w-5" />
                        </button>
                    </form>
                </div>
            </main>
        </div>
    );
}
