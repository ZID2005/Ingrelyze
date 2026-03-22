import { useRef, useEffect, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText as GSAPSplitText } from 'gsap/SplitText';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, GSAPSplitText, useGSAP);

const GreetingText = ({
  text = '',
  className = '',
  delay = 35,
  duration = 0.8,
  ease = 'power2.out',
  splitType = 'chars',
  textAlign = 'left',
  tag = 'h1',
  style = {},
  enableScrollTrigger = false,
  onComplete
}) => {
  const ref = useRef(null);
  const [fontsLoaded, setFontsLoaded] = useState(true);

  useEffect(() => {
    // Fonts check removed to prevent animation lag. 
    // Animation now starts immediately.
  }, []);

  useGSAP(() => {
    if (!ref.current || !text || !fontsLoaded) return;

    const el = ref.current;
    console.log('GreetingText animating:', text, 'targets count:', el.innerText.length);
    
    // Safety
    if (el._gsapSplit) el._gsapSplit.revert();

    const split = new GSAPSplitText(el, {
      type: splitType,
      linesClass: 'split-line',
      wordsClass: 'split-word',
      charsClass: 'split-char'
    });

    el._gsapSplit = split;
    const targets = split.chars || split.words || split.lines;

    // Reveal parent container now that target splitting is complete
    gsap.set(el, { opacity: 1 });

    if (targets && targets.length > 0) {
      const animParams = {
        opacity: 1,
        y: 0,
        duration,
        ease,
        stagger: delay / 1000,
        onComplete: () => {
          console.log('GreetingText animation complete');
          if (onComplete) onComplete();
        }
      };

      if (enableScrollTrigger) {
        animParams.scrollTrigger = {
          trigger: el,
          start: 'top 90%',
          once: true
        };
      }

      // Explicit fromTo for maximum reliability
      gsap.fromTo(targets, 
        { opacity: 0, y: 15 }, 
        animParams
      );
    }
  }, [text, fontsLoaded, delay, duration, ease, splitType, enableScrollTrigger]);

  const Tag = tag;
  return (
    <Tag
      ref={ref}
      className={className}
      style={{
        display: 'inline-block',
        textAlign,
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word',
        margin: 0,
        paddingBottom: '0.15em',
        lineHeight: 1.2,
        opacity: 0, // Prevent FOUC flash initially
        ...style
      }}
    >
      {text}
    </Tag>
  );
};

export default GreetingText;
