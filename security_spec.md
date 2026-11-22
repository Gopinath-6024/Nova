# Security Specification — Nova Cloud Background Sync & Ecosystem

## 1. Data Invariants
1. **Owner-Only Root & Subcollections**: Every `UserVaultProfile`, `SyncedTask`, `SyncedAlarm`, `SyncedIndexedFile`, `SyncedProject`, `SyncedMemory`, `SyncedSkill`, `SyncedArtifact`, and `SyncedLanguageProgress` document belongs strictly to `request.auth.uid`, and operations require `request.auth.token.email_verified == true`.
2. **Master Gate Integrity**: Subcollection documents (`/users/{userId}/{col}/{docId}`) cannot be read individually (`get`) or mutated unless the parent `/users/{userId}` document exists and its `ownerId` matches `request.auth.uid`.
3. **Immutable Ownership & Temporal Integrity**: `ownerId`, `id`, and `createdAt` are immutable after document creation. Both `createdAt` (on create) and `updatedAt` (on create/update) must equal `request.time`.
4. **Zero-Secrets Storage**: Connector tokens, PATs, and API secrets are NEVER stored in Firestore; they remain encrypted (`AES-256-GCM`) strictly on the Express backend.
5. **Query Isolation**: All `list` operations enforce `resource.data.ownerId == request.auth.uid` on the rule itself without performing `get()`/`exists()` reads.
6. **Project Isolation**: Project-scoped `SyncedMemory` and `SyncedArtifact` documents carry validated `projectId` bounds so projects never leak context across tenants or unrelated projects.

## 2. The "Dirty Dozen" Attack Payloads (All Must Fail with PERMISSION_DENIED)
1. **Unauthenticated Write**: Writing `/users/u1/tasks/t1` with `request.auth == null`.
2. **Unverified Email Bypass**: Signed-in user with `email_verified: false` creating `/users/u1`.
3. **Cross-Tenant Read**: User `u2` attempting `get` or `list` on `/users/u1/projects`.
4. **Owner Spoofing**: User `u1` creating `/users/u1/projects/p1` with `ownerId: "u2"`.
5. **Shadow / Ghost Field Injection**: User `u1` creating `/users/u1/memories/m1` with extra field `isAdmin: true`.
6. **ID Poisoning**: Creating a document at `/users/u1/skills/bad..id$with#chars` or > 128 chars.
7. **Timestamp Forgery**: Providing a client `Date` for `createdAt` or `updatedAt` instead of `request.time`.
8. **Immutable Field Tampering**: Updating `ownerId`, `id`, or `createdAt` on an existing `SyncedProject` or `SyncedArtifact`.
9. **Orphan Subcollection Write**: Creating `/users/u1/projects/p1` when parent `/users/u1` does not exist.
10. **Payload Size Exhaustion**: Submitting a `SyncedTask.title` > 240 chars or `SyncedArtifact.currentCode` > 150000 chars.
11. **Invalid Enum / Regex Bypass**: Setting `SyncedArtifact.kind` to `"malware"` or `SyncedAlarm.time24` to `"99:99"`.
12. **Array Bounds Overflow**: Submitting `SyncedAlarm.repeatDays` with 8+ items or `SyncedProject.folders` with > 20 entries.
