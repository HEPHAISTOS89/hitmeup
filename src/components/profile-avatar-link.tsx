import type { ProfileProjection } from "@/lib/types";
import { StudentAvatar } from "./student-avatar";

export function ProfileAvatarPicture({ profile }: { profile: ProfileProjection | null }) {
  if (!profile) return <span className="profile-avatar-fallback" aria-hidden="true">ST</span>;
  const avatar = profile.avatarConfig;
  return <StudentAvatar className="student-avatar" skin={avatar.skin} hair={avatar.hair} hairColor={avatar.hairColor} face={avatar.face} outfit={avatar.outfit} accessory={avatar.accessory} title={`${profile.displayName}'s avatar`} />;
}

export function ProfileAvatarLink({ profile, previewMode }: { profile: ProfileProjection | null; previewMode: boolean }) {
  return <a className="profile-avatar-link" href={previewMode ? "/avatar?preview=1" : "/avatar"} aria-label="Customize your avatar" title="Customize your avatar">
    <ProfileAvatarPicture profile={profile} />
    <span aria-hidden="true">✎</span>
  </a>;
}
