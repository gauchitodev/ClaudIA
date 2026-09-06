// Sube un archivo a tmpfiles.org y devuelve el link de descarga directa. Usa el fetch y el FormData nativos de Node.
export default async (buffer) => {
  try {
    const formData = new FormData();
    formData.append("file", new Blob([buffer]), "image.jpg");
    const res = await fetch("https://tmpfiles.org/api/v1/upload", { method: "POST", body: formData, signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`tmpfiles respondió ${res.status}`);
    const json = await res.json();

    // el link que devuelve es la página del archivo; el de descarga directa lleva /dl/
    const url = json.data.url.replace(/^https?:\/\//, "").replace("tmpfiles.org/", "tmpfiles.org/dl/");
    return `https://${url}`;
  } catch (error) {
    console.error("Error al subir la imagen:", error);
    throw new Error("Failed to upload the image", { cause: error });
  }
};
