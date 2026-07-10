import { MdArrowOutward, MdCopyright } from "react-icons/md";
import { FaWhatsapp } from "react-icons/fa6";
import "./styles/Contact.css";

const Contact = () => {
  return (
    <div className="contact-section section-container" id="contact">
      <div className="contact-container">
        <h3>Contact</h3>
        <div className="contact-flex">
          <div className="contact-box">
            <h4>Email</h4>
            <p>
              <a href="mailto:ritabrata720@gmail.com" data-cursor="disable">
                ritabrata720@gmail.com
              </a>
            </p>
            <h4>Education</h4>
            <p>B.Tech in Computer Science &amp; Engineering</p>
          </div>
          <div className="contact-box">
            <h4>Social</h4>
            <a
              href="https://github.com/Ritabrata-Paul"
              target="_blank"
              data-cursor="disable"
              className="contact-social"
            >
              Github <MdArrowOutward />
            </a>
            <a
              href="https://www.linkedin.com/in/ritabrata-paul-23a75919a"
              target="_blank"
              data-cursor="disable"
              className="contact-social"
            >
              Linkedin <MdArrowOutward />
            </a>
            <a
              href="https://auth.geeksforgeeks.org/user/ritabrata720"
              target="_blank"
              data-cursor="disable"
              className="contact-social"
            >
              GeeksforGeeks <MdArrowOutward />
            </a>
            <a
              href="https://www.facebook.com/ritabrata.paul.58"
              target="_blank"
              data-cursor="disable"
              className="contact-social"
            >
              Facebook <MdArrowOutward />
            </a>
            <a
              href="https://www.youtube.com/@techfool1169"
              target="_blank"
              data-cursor="disable"
              className="contact-social"
            >
              YouTube <MdArrowOutward />
            </a>
            <a
              href="https://wa.me/918617274768"
              target="_blank"
              data-cursor="disable"
              className="contact-social contact-whatsapp"
            >
              WhatsApp <FaWhatsapp />
            </a>
          </div>
          <div className="contact-box">
            <h2>
              Designed and Developed <br /> by <span>Ritabrata Paul</span>
            </h2>
            <h5>
              <MdCopyright /> 2026
            </h5>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Contact;
