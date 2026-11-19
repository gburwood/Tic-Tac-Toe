# SpecForge project records

Format: `specforge-desktop-lightweight-v1`. This directory belongs to the project, not the management application. Keep it with the project files when moving, copying or versioning this workspace.

- `project.json` identifies the project and the format.
- `events.json` holds the full ordered event history, including identity, purpose, content fingerprints, discussions, proposed file operations, approvals, implementation, test plans, actual validation evidence and completion. Replay in sequence order to reconstruct the recorded project state; the current files are the material workspace. Do not infer a completed change from a proposal.
- `pending.json`, if present, is an interrupted implementation journal. Finish recovery in the original installation before transferring.

This data is plain JSON and does not require the desktop application to read it. It is not the SpecForge Core canonical format and is not a signed governance record. Do not hand-edit the event log while the manager is running. Use one active management installation per workspace. Review conversations, file content and test output for sensitive information before sharing. No provider credentials or absolute workspace registration path are intentionally written here.
