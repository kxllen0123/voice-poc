interface ChatBubbleProps {
  role: "user" | "assistant";
  content: string;
}

export default function ChatBubble({ role, content }: ChatBubbleProps) {
  return (
    <div className={`flex ${role === "user" ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${
          role === "user"
            ? "bg-[#2563eb] text-white rounded-br-md"
            : "bg-white/[0.08] text-white/90 rounded-bl-md"
        }`}
      >
        {content}
      </div>
    </div>
  );
}
