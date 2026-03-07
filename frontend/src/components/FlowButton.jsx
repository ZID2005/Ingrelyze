import React from "react";
import "./FlowButton.css";

const ArrowRight = ({ className }) => (
    <svg
        className={className}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M5 12h14" />
        <path d="m12 5 7 7-7 7" />
    </svg>
);

export function FlowButton({ text = "Modern Button", onClick, className }) {
    return (
        <button className={`flow-button ${className || ""}`} onClick={onClick}>
            {/* Left arrow (arr-2) */}
            <ArrowRight className="arrow-left" />

            {/* Text */}
            <span className="button-text">
                {text}
            </span>

            {/* Expanding Circle Background */}
            <span className="circle-fill"></span>

            {/* Right arrow (arr-1) */}
            <ArrowRight className="arrow-right" />
        </button>
    );
}
