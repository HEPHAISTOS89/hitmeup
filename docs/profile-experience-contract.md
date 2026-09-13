# Profile experience contract

## Product truth

Product loop: verified student opens their own profile -> reviews or edits chosen public details -> sees request-derived activity and bilateral reviews -> decides whether to update their profile, open safety settings, or customize their avatar.

### Observed

- `profiles` already stores a display name, optional bio, interests, aggregate rating/completion counts, avatar configuration, and private wallet data.
- `service_requests` already records the current student's role, service summary, lifecycle status, counterpart projection, and dates. This is the source of profile activity; there is no meetup table.
- Ratings are one per participant and existing policy reveals them only after both participants submit. Rating comments already support 500 characters in the database and repository.
- Avatar Studio and the cosmetic SKU called `campus-theme` already exist. That SKU changes an avatar effect; it is not the application color theme.

### Inferred

- “Hosted” from the reference is best expressed as **Provided** in HitMeUp because this product is a one-off service exchange, not a meetup platform.
- The current student's own received reviews can be useful without adding public profiles when the projection is current-subject-only and preserves bilateral/closed-request gates.
- A global light/dark preference is device-local UI state and does not belong in the profile or cosmetic catalog.

### Assumed

- A distinct count of request `serviceId` values where the viewer role is `provider` is an honest currently available Provided count. It may exclude provided offers that never received a request.
- System color preference is the correct initial fallback when the user has not made an explicit theme choice.

### Unknown / deferred

- Program/major, class year, global availability, and payment preference are deferred. The current product has no visibility/moderation contract for those profile fields, and global availability conflicts with per-offer availability. Payment account details must never become profile data.
- Public profiles for other people and public review publication are deferred until audience, reporting, blocking, moderation, and deletion policies exist.
- Whether withdrawn or deleted services should remain in Provided aggregates needs a product/data-retention decision.
- Live database behavior remains unproven until migration `202609120005_profile_experience.sql` is reviewed and applied to an explicitly approved development database.

## Frame and state map

| Frame / surface | Primary job | Data source | States | Status |
| --- | --- | --- | --- | --- |
| Global topbar theme control | Switch the whole app between light and dark | `localStorage`, then system preference | light, dark, storage unavailable | Implemented; browser/runtime proof still required |
| Own profile identity | Confirm whose private profile view is open | `get_my_profile` | loading, verified, unavailable through parent data error | Implemented |
| Profile details editor | Edit chosen name, About, and interests | existing profile PATCH API | idle, editing, validation, saving, saved, error, cancel | Implemented |
| Profile stats | Summarize completion, provided services, rating | profile aggregate + request projection | zero/new, populated | Implemented |
| Activity/history | Understand current and previous one-off services | existing `list_my_service_requests` | in progress, last 30 days, earlier, empty | Implemented |
| Reviews received | Read reviews about the signed-in student only | new `list_my_received_reviews` RPC | loading, populated, empty, error | Conditional on migration in live mode |
| Avatar Studio | Customize visual identity without conflating app theme | existing profile/cosmetics APIs | existing studio states | Preserved as a separate section |
| Rating drawer comment | Add an optional respectful note | existing rating POST/RPC | empty, 1-500 chars, submitted/disabled | Implemented |
| Local preview | Demonstrate profile, activity, review, and reversible edits | explicit in-memory fixtures | sample, editing, saved, cancel, reset/reload | Implemented; always labeled non-live |

## Privacy and safety contract

- The profile route is own-only. This batch adds no route that accepts another student's identifier.
- Review results contain a review id, score, optional comment, date, author display name/initials, and service title only. They exclude Auth0 subjects, email, wallet, request party ids, and location.
- The review RPC requires `rating.subject_id = current_subject()`, a closed request, current-subject participation, and two submitted ratings.
- Activity uses the existing participant-scoped request projection and never reconstructs internal ids, exact locations, or messages.
- Preview fixtures are labeled local sample data and never presented as persisted or live.

## Verification boundary

Targeted unit/component tests cover theme persistence and toggle labeling, request-role activity grouping, Provided counting, reversible preview editing, rating comment mapping/validation, repository review mapping, and migration privacy clauses. Typecheck, lint, test, and production build should be recorded by the implementation handoff.

No migration was applied, and no commit, push, deployment, public profile publication, or shared database write is authorized by this document.
