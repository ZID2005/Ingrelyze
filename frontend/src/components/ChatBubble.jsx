import React from "react";
import "./ChatBubble.css";

const cn = (...classes) => classes.filter(Boolean).join(" ");

export function ChatBubble({
    variant = "received",
    layout = "default",
    className,
    children,
}) {
    return (
        <div
            className={cn(
                "chat-bubble-container",
                variant === "sent" ? "chat-bubble-sent" : "chat-bubble-received",
                className
            )}
        >
            {children}
        </div>
    );
}

export function ChatBubbleMessage({
    variant = "received",
    isLoading,
    className,
    children,
}) {
    return (
        <div
            className={cn(
                "chat-bubble-message",
                variant === "sent" ? "chat-bubble-message-sent" : "chat-bubble-message-received",
                className
            )}
        >
            {isLoading ? (
                <MessageLoading />
            ) : (
                children
            )}
        </div>
    );
}

export function ChatBubbleAvatar({
    src,
    fallback = "AI",
    className,
}) {
    return (
        <div className={cn("chat-bubble-avatar", className)}>
            {src ? <img src={src} alt="avatar" /> : <span>{fallback}</span>}
        </div>
    );
}

export function ChatBubbleAction({
    icon,
    onClick,
    className,
}) {
    return (
        <button
            className={cn("chat-bubble-action", className)}
            onClick={onClick}
        >
            {icon}
        </button>
    );
}

export function ChatBubbleActionWrapper({
    className,
    children,
}) {
    return (
        <div className={cn("chat-bubble-action-wrapper", className)}>
            {children}
        </div>
    );
}

export function MessageLoading() {
    return (
        <div className="chat-bubble-loading">
            <div className="chat-bubble-dot"></div>
            <div className="chat-bubble-dot"></div>
            <div className="chat-bubble-dot"></div>
        </div>
    );
}
