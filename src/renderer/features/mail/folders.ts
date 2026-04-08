export function isProtectedFolder(folder: { type: string | null; path: string }): boolean {
    const type = (folder.type || "").toLowerCase();
    const path = folder.path.toLowerCase();
    if (type === "inbox" || path === "inbox") return true;
    if (type === "sent" || path.includes("sent")) return true;
    if (type === "drafts" || path.includes("draft")) return true;
    if (type === "archive" || path.includes("archive")) return true;
    if (type === "junk" || path.includes("spam") || path.includes("junk")) return true;
    if (type === "trash" || path.includes("trash") || path.includes("deleted")) return true;
    return false;
}
