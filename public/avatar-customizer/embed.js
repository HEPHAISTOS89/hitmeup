const reportHeight = () => window.parent.postMessage({
  type: "avatar-studio-height",
  height: Math.ceil(document.querySelector("main").getBoundingClientRect().bottom + 24),
}, window.location.origin);
new ResizeObserver(reportHeight).observe(document.querySelector("main"));
window.addEventListener("load", reportHeight);

document.querySelector("#save").addEventListener("click", () => {
  if (!currentCharacter()) return;
  try {
    const picture = document.createElement("canvas");
    picture.width = 260; picture.height = 260;
    const context = picture.getContext("2d");
    drawBackground(context, 260, 260, state.background);
    // Crop to the head and shoulders for a readable profile bubble.
    context.drawImage(document.querySelector("#avatar"), 70, 0, 380, 380, 0, 0, 260, 260);
    localStorage.setItem("hmu-avatar-picture", picture.toDataURL("image/png"));
  } catch {
    notify("Your look is saved, but the profile picture could not be updated.");
  }
});
