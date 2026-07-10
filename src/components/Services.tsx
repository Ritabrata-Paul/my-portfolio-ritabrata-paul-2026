import "./styles/Services.css";

const Services = () => {
  return (
    <div className="services-section section-container" id="services">
      <div className="services-container">
        <h2>
          Freelance <span>Projects</span>
        </h2>
        <p className="services-intro">
          I take on freelance projects — building websites, web apps, and
          full-stack solutions for clients across these domains.
        </p>
        <div className="services-grid">
          <div className="service-card">
            <div className="service-number">01</div>
            <h3>Websites & Web Apps</h3>
            <p>
              I build custom websites and full-stack web applications using
              MERN Stack, Next.js, Django, and Flask — from landing pages to
              complex platforms, tailored to client needs.
            </p>
          </div>
          <div className="service-card">
            <div className="service-number">02</div>
            <h3>Cloud & DevOps Solutions</h3>
            <p>
              I set up cloud infrastructure on AWS, Azure, and GCP for clients.
              CI/CD pipelines, Docker & Kubernetes deployments, Terraform
              automation — everything needed to ship and scale.
            </p>
          </div>
          <div className="service-card">
            <div className="service-number">03</div>
            <h3>Cybersecurity Projects</h3>
            <p>
              I work on cybersecurity-focused projects including vulnerability
              assessments, penetration testing, and building security-hardened
              applications using Kali Linux and OWASP practices.
            </p>
          </div>
          <div className="service-card">
            <div className="service-number">04</div>
            <h3>E-Commerce & Business Apps</h3>
            <p>
              I create e-commerce stores, CRM tools, and business management
              apps for startups and small businesses — delivering MVPs fast
              and scaling them as the business grows.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Services;
