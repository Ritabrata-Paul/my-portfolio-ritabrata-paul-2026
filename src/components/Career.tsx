import "./styles/Career.css";

const Career = () => {
  return (
    <div className="career-section section-container">
      <div className="career-container">
        <h2>
          My career <span>&</span>
          <br /> experience
        </h2>
        <div className="career-info">
          <div className="career-timeline">
            <div className="career-dot"></div>
          </div>
          <div className="career-info-box">
            <div className="career-info-in">
              <div className="career-role">
                <h4>Full Stack Developer Intern</h4>
                <h5>MockPI</h5>
              </div>
              <h3>2023</h3>
            </div>
            <p>
              Implemented frontend and backend development using OpenAI
              technology. Integrated databases for efficient data management
              and enhanced the website's UI/UX for a dynamic user experience.
            </p>
          </div>
          <div className="career-info-box">
            <div className="career-info-in">
              <div className="career-role">
                <h4>Dev Ops Engineer</h4>
                <h5>Indium Software (India) Pvt Ltd</h5>
              </div>
              <h3>2023</h3>
            </div>
            <p>
              Automated deployment pipelines and infrastructure configurations.
              Implemented robust monitoring and logging systems, and fostered
              CI/CD practices across development and operations teams.
            </p>
          </div>
          <div className="career-info-box">
            <div className="career-info-in">
              <div className="career-role">
                <h4>Technical Researcher</h4>
                <h5>Royal Research</h5>
              </div>
              <h3>NOW</h3>
            </div>
            <p>
              Conducting in-depth technical research in Back-End Web Development
              using MERN Stack, Django, Flask, ASP.NET, and DevOps technologies.
              Integrating cutting-edge frameworks and tools for scalable applications.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Career;
