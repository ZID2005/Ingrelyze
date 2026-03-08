import * as React from "react"
import { motion } from "framer-motion"
import { cn } from "../utils/cn"

const AnimatedText = React.forwardRef(({
    text,
    duration = 0.5,
    delay = 0.05,
    replay = true,
    className,
    textClassName,
    underlineClassName,
    as: Component = "p",
    underlineGradient = "from-[#b19eef] via-purple-500 to-[#b19eef]",
    underlineHeight = "h-[1px]",
    underlineOffset = "-bottom-1",
    ...props
}, ref) => {
    const letters = Array.from(text)

    const container = {
        hidden: {
            opacity: 0
        },
        visible: (i = 1) => ({
            opacity: 1,
            transition: {
                staggerChildren: duration / letters.length,
                delayChildren: i * delay
            }
        })
    }

    const child = {
        visible: {
            opacity: 1,
            y: 0,
            transition: {
                type: "spring",
                damping: 12,
                stiffness: 200
            }
        },
        hidden: {
            opacity: 0,
            y: 10,
            transition: {
                type: "spring",
                damping: 12,
                stiffness: 200
            }
        }
    }

    const lineVariants = {
        hidden: {
            width: "0%",
            left: "50%"
        },
        visible: {
            width: "100%",
            left: "0%",
            transition: {
                delay: letters.length * 0.03 + delay,
                duration: 0.8,
                ease: "easeOut"
            }
        }
    }

    return (
        <div
            ref={ref}
            className={cn("flex flex-col items-center justify-center gap-1", className)}
            {...props}
        >
            <div className="relative">
                <motion.div
                    style={{ display: "flex", flexWrap: "wrap", justifyContent: "center" }}
                    variants={container}
                    initial="hidden"
                    whileInView={replay ? "visible" : "hidden"}
                    viewport={{ once: true }}
                    className={cn("text-lg font-medium text-center", textClassName)}
                >
                    {letters.map((letter, index) => (
                        <motion.span key={index} variants={child}>
                            {letter === " " ? "\u00A0" : letter}
                        </motion.span>
                    ))}
                </motion.div>

                <motion.div
                    variants={lineVariants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    className={cn(
                        "absolute",
                        underlineHeight,
                        underlineOffset,
                        "bg-gradient-to-r opacity-30",
                        underlineGradient,
                        underlineClassName
                    )}
                />
            </div>
        </div>
    )
})

AnimatedText.displayName = "AnimatedText"

export default AnimatedText
