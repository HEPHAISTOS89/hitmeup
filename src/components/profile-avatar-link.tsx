"use client";
import { useEffect, useState } from "react";

export function ProfileAvatarPicture() {
  const [image, setImage] = useState<string>();
  useEffect(() => {
    const read = () => { try { const value = localStorage.getItem("hmu-avatar-picture"); if (value?.startsWith("data:image/png;base64,")) setImage(value); } catch {} };
    read();
    window.addEventListener("storage", read);
    return () => window.removeEventListener("storage", read);
  }, []);
  // The picture is a data URL from localStorage, which next/image cannot optimize.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={image ?? "/avatar-customizer/assets/character-v3.png"} alt="Your avatar" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />;
}

export function ProfileAvatarLink({ previewMode }: { previewMode: boolean }) {
  return <a className="profile-avatar-link" href={previewMode ? "/avatar?preview=1" : "/avatar"} aria-label="Customize your avatar" title="Customize your avatar">
    <ProfileAvatarPicture />
    <span aria-hidden="true">✎</span>
  </a>;
}
