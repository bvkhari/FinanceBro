// Receipt photos and PDFs picked in the chat, ready to send to the agent.
// Photos are shrunk on the device first: a phone photo is several MB,
// the request limit is 4.5 MB, and 1600 px is plenty to read a receipt.

export interface ReceiptDraft {
  id: string;
  name: string;
  kind: "image" | "pdf";
  previewUrl: string;
  mediaType: string;
  data: string; // base64, no data: prefix
}

const MAX_SIDE = 1600;
const MAX_PDF_BYTES = 2_200_000;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That image couldn't be opened."));
    img.src = url;
  });
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("That file couldn't be read."));
    reader.readAsDataURL(file);
  });
}

export async function prepareReceipt(file: File): Promise<ReceiptDraft> {
  const id = `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const previewUrl = URL.createObjectURL(file);

  if (file.type === "application/pdf") {
    if (file.size > MAX_PDF_BYTES) throw new Error("That PDF is too large. Send a photo or a smaller PDF (under 2 MB).");
    return { id, name: file.name, kind: "pdf", previewUrl, mediaType: "application/pdf", data: await readBase64(file) };
  }
  if (!file.type.startsWith("image/")) throw new Error("Send a photo or a PDF of the receipt.");

  const img = await loadImage(previewUrl);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("That image couldn't be processed.");
  ctx.fillStyle = "#fff"; // transparent PNGs become white, not black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const data = canvas.toDataURL("image/jpeg", 0.82).split(",")[1] ?? "";
  return { id, name: file.name || "Receipt", kind: "image", previewUrl, mediaType: "image/jpeg", data };
}
