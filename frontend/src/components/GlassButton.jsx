import React from "react";
import "./GlassButton.css";

const cn = (...classes) => classes.filter(Boolean).join(" ");

export const GlassButton = React.forwardRef(({
    className,
    children,
    size = "default",
    contentClassName,
    ...props
}, ref) => {
    // Size classes mapping
    const sizeClasses = {
        default: "text-base font-medium",
        sm: "text-sm font-medium",
        lg: "text-lg font-medium",
        icon: "h-10 w-10 flex items-center justify-center",
    };

    const textPaddingClasses = {
        default: "px-6 py-3.5",
        sm: "px-4 py-2",
        lg: "px-8 py-4",
        icon: "flex h-10 w-10 items-center justify-center",
    };

    return (
        <div className={cn("glass-button-wrap cursor-pointer rounded-full", className)}>
            <button
                ref={ref}
                className={cn(
                    "glass-button relative isolate all-unset cursor-pointer rounded-full transition-all",
                    sizeClasses[size] || sizeClasses.default
                )}
                {...props}
            >
                <span
                    className={cn(
                        "glass-button-text relative block select-none tracking-tighter",
                        textPaddingClasses[size] || textPaddingClasses.default,
                        contentClassName
                    )}
                >
                    {children}
                </span>
            </button>
            <div className="glass-button-shadow rounded-full"></div>
        </div>
    );
});

GlassButton.displayName = "GlassButton";
