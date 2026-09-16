# Skynet OS Agent Guidelines

## 🛡️ Mandatory Safety & Backup Discipline

1. **Auto-Backup via Git (NON-NEGOTIABLE):**
   - Whenever any code modification, feature addition, or bug fix is completed and verified:
     **YOU MUST RUN git add ., git commit, AND git push origin main IMMEDIATELY.**
   - Do NOT leave uncommitted or unpushed work on the local disk. If the machine crashes, all code must exist intact on GitHub (stillcold64/Skynet-OS).

2. **Offsite Data Redundancy (Google Sheets):**
   - All financial transaction data ingested through the Telegram bot must be synced to Google Sheets via the Apps Script Webhook.
   - Database files (data/skynet.db) should also be backed up or committed periodically to ensure zero data loss.

3. **No Destructive Deletions:**
   - Never delete or overwrite files outside the repository.
   - Never run recursive wildcard delete commands on broad paths.
   - Always verify and prove changes before declaring them done.
