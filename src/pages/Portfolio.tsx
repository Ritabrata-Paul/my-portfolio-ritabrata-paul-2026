import { lazy, Suspense } from "react";
import { LoadingProvider } from "../context/LoadingProvider";

const CharacterModel = lazy(() => import("../components/Character"));
const MainContainer = lazy(() => import("../components/MainContainer"));

// The main 3D portfolio (route "/").
const Portfolio = () => {
  return (
    <LoadingProvider>
      <Suspense fallback={<></>}>
        <MainContainer>
          <CharacterModel />
        </MainContainer>
      </Suspense>
    </LoadingProvider>
  );
};

export default Portfolio;
