import React from "react";
import { Send, Loader2, Paperclip, Sparkles } from "lucide-react";

// === N8N WEBHOOKS ===
const N8N_CHAT_WEBHOOK_URL = import.meta.env.VITE_N8N_CHAT_WEBHOOK_URL;
const N8N_UPLOAD_WEBHOOK_URL = import.meta.env.VITE_N8N_UPLOAD_WEBHOOK_URL;

// === HELPER FUNCTIONS ===
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
        "Hello! How may I assist you?",
    sources: [],
};

// === COMPONENTS ===
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
                    <div
                        dangerouslySetInnerHTML={{
                            __html: formatMarkdownToHtml(message.message),
                        }}
                    />
                </div>
            </div>
        </div>
    );
};

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

// === MAIN APP ===
export default function App() {
    const [messages, setMessages] = React.useState([WELCOME_MESSAGE]);
    const [currentMessage, setCurrentMessage] = React.useState("");
    const [chatStatus, setChatStatus] = React.useState("idle");
    const [currentSessionID, setCurrentSessionID] = React.useState(
        `session-${Date.now()}`
    );
    const [error, setError] = React.useState(null);
    const chatEndRef = React.useRef(null);

    React.useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    async function handleSendMessage(e) {
        e.preventDefault();
        if (chatStatus !== "idle") return;
        const trimmed = currentMessage.trim();
        if (!trimmed) return;

        setChatStatus("thinking");
        setMessages((prev) => [
            ...prev,
            { id: `user-${Date.now()}`, sender: "user", message: trimmed },
        ]);
        setCurrentMessage("");

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
            const { answer } = parseN8nResponse(respData);

            setMessages((prev) => [
                ...prev,
                { id: `ai-${Date.now()}`, sender: "ai", message: answer },
            ]);
        } catch (err) {
            setError(err.message);
            setMessages((prev) => [
                ...prev,
                {
                    id: `err-${Date.now()}`,
                    sender: "system",
                    message: `Error: ${err.message}`,
                },
            ]);
        } finally {
            setChatStatus("idle");
        }
    }

    async function handleFileChange(e) {
        const file = e.target.files[0];
        if (!file || chatStatus !== "idle") return;
        setChatStatus("uploading");

        setMessages((prev) => [
            ...prev,
            {
                id: `sys-${Date.now()}`,
                sender: "system",
                message: `Uploading ${file.name}...`,
            },
        ]);

        const formData = new FormData();
        formData.append("file", file);
        formData.append("session_id", currentSessionID);

        try {
            const response = await fetch(N8N_UPLOAD_WEBHOOK_URL, {
                method: "POST",
                body: formData,
            });
            if (!response.ok)
                throw new Error(`Server responded with ${response.status}`);

            setMessages((prev) => [
                ...prev,
                {
                    id: `sys-${Date.now()}`,
                    sender: "system",
                    message:
                        "File uploaded successfully! Now you can chat with context from this doc.",
                },
            ]);
        } catch (err) {
            setMessages((prev) => [
                ...prev,
                {
                    id: `err-${Date.now()}`,
                    sender: "system",
                    message: `Upload failed: ${err.message}`,
                },
            ]);
        } finally {
            setChatStatus("idle");
            e.target.value = null;
        }
    }

    return (
        <div className="flex flex-col h-screen bg-gray-800 text-gray-100 font-sans">
            <div className="w-full text-center py-4 bg-gray-900 shadow-md">
                <h1 className="text-2xl font-bold tracking-wide text-blue-300">
                    Chatbot - Coreassess.AI
                </h1>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <div className="max-w-4xl mx-auto flex flex-col space-y-4">
                    {error && (
                        <div className="p-4 bg-red-700/40 text-red-200 rounded">
                            {error}
                        </div>
                    )}
                    {messages.map((msg) => (
                        <ChatMessage key={msg.id} message={msg} />
                    ))}
                    {chatStatus === "thinking" && <TypingIndicator />}
                    {chatStatus === "uploading" && (
                        <div className="flex justify-start">
                            <div className="p-3 rounded-lg bg-gray-700 text-gray-100 flex items-center space-x-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span className="text-sm italic">
                                    Uploading file...
                                </span>
                            </div>
                        </div>
                    )}
                    <div ref={chatEndRef} />
                </div>
            </div>

            {/* Input Area */}
            <div className="p-4 bg-gray-900 border-t border-gray-700/50 shadow-inner">
                <form
                    onSubmit={handleSendMessage}
                    className="flex items-center space-x-3 max-w-3xl mx-auto"
                >


{/* File Upload button: Uncomment to make it work */}

                    {/* <label
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
                    /> */}
                    <input
                        type="text"
                        value={currentMessage}
                        onChange={(e) => setCurrentMessage(e.target.value)}
                        placeholder="Type your message..."
                        className="flex-1 p-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500"
                        disabled={chatStatus !== "idle"}
                    />
                    <button
                        type="submit"
                        className="flex-shrink-0 bg-blue-600 text-white p-3 rounded-full hover:bg-blue-700 hover:scale-105 disabled:bg-gray-600 disabled:hover:scale-100"
                        disabled={!currentMessage || chatStatus !== "idle"}
                    >
                        <Send className="h-5 w-5" />
                    </button>
                </form>
            </div>
        </div>
    );
}
