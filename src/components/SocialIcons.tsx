import {
  FaGithub,
  FaLinkedinIn,
  FaXTwitter,
  FaFilePdf,
  FaFileWord,
} from "react-icons/fa6";
import "./styles/SocialIcons.css";
import { useEffect } from "react";
import HoverLinks from "./HoverLinks";

const SocialIcons = () => {
  useEffect(() => {
    const social = document.getElementById("social") as HTMLElement;
    if (!social) return;

    social.querySelectorAll("span").forEach((item) => {
      const elem = item as HTMLElement;
      const link = elem.querySelector("a") as HTMLElement;
      if (!link) return; // Guard: skip spans without an anchor child

      const rect = elem.getBoundingClientRect();
      let mouseX = rect.width / 2;
      let mouseY = rect.height / 2;
      let currentX = 0;
      let currentY = 0;

      const updatePosition = () => {
        currentX += (mouseX - currentX) * 0.1;
        currentY += (mouseY - currentY) * 0.1;

        link.style.setProperty("--siLeft", `${currentX}px`);
        link.style.setProperty("--siTop", `${currentY}px`);

        requestAnimationFrame(updatePosition);
      };

      const onMouseMove = (e: MouseEvent) => {
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (x < 40 && x > 10 && y < 40 && y > 5) {
          mouseX = x;
          mouseY = y;
        } else {
          mouseX = rect.width / 2;
          mouseY = rect.height / 2;
        }
      };

      document.addEventListener("mousemove", onMouseMove);

      updatePosition();

      return () => {
        elem.removeEventListener("mousemove", onMouseMove);
      };
    });
  }, []);

  return (
    <div className="icons-section">
      <div className="social-icons" data-cursor="icons" id="social">
        <span>
          <a href="https://github.com/Ritabrata-Paul" target="_blank">
            <FaGithub />
          </a>
        </span>
        <span>
          <a href="https://www.linkedin.com/in/ritabrata-paul-23a75919a" target="_blank">
            <FaLinkedinIn />
          </a>
        </span>
        <span>
          <a href="https://auth.geeksforgeeks.org/user/ritabrata720" target="_blank">
            <FaXTwitter />
          </a>
        </span>
      </div>
      <div className="resume-downloads">
        <a
          className="resume-button"
          href="/api/resume/pdf"
          download="Ritabrata Paul.pdf"
          data-cursor="disable"
        >
          <HoverLinks text="RESUME" />
          <span className="resume-icon">
            <FaFilePdf />
          </span>
        </a>
        <a
          className="resume-button resume-word-btn"
          href="/api/resume/docx"
          download="Ritabrata Paul.docx"
          data-cursor="disable"
          title="Download Word format"
        >
          <span className="resume-icon">
            <FaFileWord />
          </span>
        </a>
      </div>
    </div>
  );
};

export default SocialIcons;

