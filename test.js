let endListener = false;

clickElement.addEventListener("click", () => {
  if (endListener) {
    endListener = false;
  } else {
    endListener = true;
  }
});
