import axios from "axios";
import FormData from "form-data";

export default async (buffer) => {
  try {
    const formData = new FormData();
    formData.append("file", buffer, { filename: "image.jpg" });

    const response = await axios.post("https://tmpfiles.org/api/v1/upload", formData, { headers: formData.getHeaders() });

    let url = response.data.data.url;

    // normalizar protocolo
    url = url.replace(/^https?:\/\//, "");

    // convertir a dl/
    url = url.replace("tmpfiles.org/", "tmpfiles.org/dl/");

    // devolver con https
    return `https://${url}`;
  } catch (error) {
    console.error("Error al subir la imagen:", error);
    throw new Error("Failed to upload the image", { cause: error });
  }
};
