// Compress images in the browser so uploads stay under TTD size limits.
export function fileToDataUrl(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
}
export async function compressImage(file, maxBytes = 1048576) {
  if (file.type === "application/pdf") {
    if (file.size > maxBytes) throw new Error(`PDF is ${(file.size / 1048576).toFixed(1)} MB; limit is ${(maxBytes / 1048576).toFixed(1)} MB`);
    return fileToDataUrl(file);
  }
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Use a JPEG or PNG image");
  if (file.size <= maxBytes && file.type !== "image/webp") return fileToDataUrl(file);
  const bmp = await createImageBitmap(file);
  let scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  for (let attempt = 0; attempt < 8; attempt++) {
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
    for (const q of [0.85, 0.7, 0.55]) {
      const blob = await new Promise(r => c.toBlob(r, "image/jpeg", q));
      if (blob.size <= maxBytes) return fileToDataUrl(new File([blob], "img.jpg", { type: "image/jpeg" }));
    }
    scale *= 0.75;
  }
  throw new Error("Could not shrink the image under the size limit");
}
