import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import "./App.css";
import Portfolio from "./pages/Portfolio";

const BlogList = lazy(() => import("./pages/BlogList"));
const BlogPost = lazy(() => import("./pages/BlogPost"));

const App = () => {
  return (
    <Routes>
      <Route path="/" element={<Portfolio />} />
      <Route path="/blog" element={<Suspense fallback={<></>}><BlogList /></Suspense>} />
      <Route path="/blog/:slug" element={<Suspense fallback={<></>}><BlogPost /></Suspense>} />
    </Routes>
  );
};

export default App;
