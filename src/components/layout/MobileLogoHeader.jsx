import { useState, useRef, useEffect } from "react";
import GymCompLogotype from "../../assets/Logotype.svg";
import GymCompLogomark from "../../assets/Logomark.svg";

// ============================================================
// MOBILE LOGO HEADER — pill at top, hides on scroll down
// ============================================================
function MobileLogoHeader({ onGoHome }) {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    const el = document.querySelector(".app-main");
    const target = el || window;
    const onScroll = () => {
      const y = el ? el.scrollTop : window.scrollY;
      if (y > 48) setHidden(true);
      else setHidden(false);
      lastY.current = y;
    };
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className={`mobile-logo-header${hidden ? " hidden" : ""}`} onClick={onGoHome} style={{ cursor: "pointer" }}>
      <img src={GymCompLogotype} alt="GymComp" className="mlh-logotype" />
      <img src={GymCompLogomark} alt="" className="mlh-logomark" />
    </div>
  );
}


export default MobileLogoHeader;
