import React from "react";
import { motion } from "motion/react";
import "./Spinner.css";

/**
 * RoundSpinner — Animated circular spinner (SVG-based)
 * @param {string} size — 'xs' | 'sm' | 'md' | 'lg' | 'xl'
 * @param {string} color — Any valid CSS color
 * @param {boolean} inline — If true, renders inline (for buttons)
 */
export function RoundSpinner({ size = "md", color = "#64748b", inline = false }) {
    return (
        <div
            className={`spinner-wrapper ${inline ? 'spinner-inline' : ''}`}
            aria-label="Loading..."
            role="status"
        >
            <svg
                className={`spinner-svg spinner-${size}`}
                viewBox="3 3 18 18"
                fill={color}
            >
                <path
                    opacity="0.2"
                    d="M12 5C8.13401 5 5 8.13401 5 12C5 15.866 8.13401 19 12 19C15.866 19 19 15.866 19 12C19 8.13401 15.866 5 12 5ZM3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12Z"
                />
                <path d="M16.9497 7.05015C14.2161 4.31648 9.78392 4.31648 7.05025 7.05015C6.65973 7.44067 6.02656 7.44067 5.63604 7.05015C5.24551 6.65962 5.24551 6.02646 5.63604 5.63593C9.15076 2.12121 14.8492 2.12121 18.364 5.63593C18.7545 6.02646 18.7545 6.65962 18.364 7.05015C17.9734 7.44067 17.3403 7.44067 16.9497 7.05015Z" />
            </svg>
        </div>
    );
}

/**
 * PageLoader — Full-page centered spinner with text
 * @param {string} text — Loading message
 * @param {string} color — Spinner color
 */
export function PageLoader({ text = "Loading...", color = "#3b82f6" }) {
    return (
        <div className="page-loader">
            <RoundSpinner size="xl" color={color} />
            <span className="page-loader-text">{text}</span>
        </div>
    );
}

/**
 * LoadingDots — Animated bouncing dots
 * @param {string} variant — 'bounce' | 'pulse'
 * @param {string} color — Dot color
 * @param {string} size — Dot size in px
 */
export function LoadingDots({ variant = "bounce", color = "#3b82f6", size = "8px" }) {
    return (
        <div className={`dots-container dots-${variant}`} style={{ color }}>
            <div className="dots-dot" style={{ width: size, height: size }} />
            <div className="dots-dot" style={{ width: size, height: size }} />
            <div className="dots-dot" style={{ width: size, height: size }} />
        </div>
    );
}

/**
 * ButtonSpinner — Inline spinner for buttons (shows spinner + text)
 * @param {string} text — Button loading text
 * @param {string} color — Spinner color (defaults to white for dark buttons)
 */
export function ButtonSpinner({ text = "Loading...", color = "#ffffff" }) {
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <RoundSpinner size="sm" color={color} inline />
            {text}
        </span>
    );
}

/**
 * OrbitDots — Circular orbiting dots animation (the fancy v5 variant)
 * @param {string} color — Dot color
 * @param {number} dots — Number of dots
 */
export function OrbitDots({ color = "#3b82f6", dots = 8 }) {
    const radius = 24;
    return (
        <div style={{ position: 'relative', width: '64px', height: '64px' }}>
            {[...Array(dots)].map((_, i) => {
                const angle = (i / dots) * (2 * Math.PI);
                const x = radius * Math.cos(angle);
                const y = radius * Math.sin(angle);
                return (
                    <motion.div
                        key={i}
                        style={{
                            position: 'absolute',
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            background: color,
                            left: `calc(50% + ${x}px - 5px)`,
                            top: `calc(50% + ${y}px - 5px)`,
                        }}
                        animate={{
                            scale: [0, 1, 0],
                            opacity: [0, 1, 0],
                        }}
                        transition={{
                            duration: 4.5,
                            repeat: Infinity,
                            delay: (i / dots) * 1.7,
                            ease: "easeInOut",
                        }}
                    />
                );
            })}
        </div>
    );
}
