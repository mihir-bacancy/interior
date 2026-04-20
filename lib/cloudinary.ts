import "server-only";

import { v2 as cloudinary } from "cloudinary";

let configured = false;

function configure() {
  if (configured) return;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  configured = true;
}

export type CloudinaryVideo = {
  publicId: string;
  url: string;
  durationSec?: number;
  width?: number;
  height?: number;
  bytes?: number;
};

/**
 * Generate a signed upload URL for direct-from-downloader uploads.
 * The Python downloader will POST its mp4 bytes to this URL, avoiding the
 * need to stream large files through our Next.js API.
 */
export function signedUploadParams(folder = "interior") {
  configure();
  const timestamp = Math.floor(Date.now() / 1000);
  const paramsToSign = { folder, timestamp };
  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    process.env.CLOUDINARY_API_SECRET!
  );
  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/video/upload`,
    folder,
    timestamp,
    apiKey: process.env.CLOUDINARY_API_KEY!,
    signature,
  };
}

/** Upload a remote URL to Cloudinary (used by the downloader API ingest). */
export async function uploadFromUrl(remoteUrl: string, options?: { folder?: string; publicId?: string }): Promise<CloudinaryVideo> {
  configure();
  const res = await cloudinary.uploader.upload(remoteUrl, {
    resource_type: "video",
    folder: options?.folder || "interior",
    public_id: options?.publicId,
    overwrite: false,
    // Speed: let Cloudinary handle the fetch asynchronously? No — sync upload is fine for mp4 <100MB
  });
  return {
    publicId: res.public_id,
    url: res.secure_url,
    durationSec: res.duration,
    width: res.width,
    height: res.height,
    bytes: res.bytes,
  };
}
