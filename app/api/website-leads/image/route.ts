import { NextResponse } from "next/server";
import heicConvert from "heic-convert";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const allowedHosts = new Set(["sellyourmotorbike.co.uk", "www.sellyourmotorbike.co.uk"]);
const convertibleExtensions = new Set(["heic", "heif"]);

export async function GET(request: Request) {
  const source = new URL(request.url).searchParams.get("url");
  if (!source) return NextResponse.json({ error: "Missing image URL." }, { status: 400 });

  let imageUrl: URL;
  try {
    imageUrl = new URL(source);
  } catch {
    return NextResponse.json({ error: "Invalid image URL." }, { status: 400 });
  }

  if (imageUrl.protocol !== "https:" || !allowedHosts.has(imageUrl.hostname.toLowerCase())) {
    return NextResponse.json({ error: "Image host is not allowed." }, { status: 400 });
  }

  const extension = imageUrl.pathname.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (!extension || !convertibleExtensions.has(extension)) {
    return NextResponse.redirect(imageUrl);
  }

  const upstream = await fetch(imageUrl, { cache: "no-store" });
  if (!upstream.ok) return NextResponse.json({ error: "Unable to fetch image." }, { status: 502 });

  const contentLength = Number(upstream.headers.get("content-length") ?? 0);
  if (contentLength > 15 * 1024 * 1024) return NextResponse.json({ error: "Image is too large." }, { status: 413 });

  const sourceBuffer = Buffer.from(await upstream.arrayBuffer());
  const jpeg = await heicConvert({ buffer: sourceBuffer, format: "JPEG", quality: 0.86 });

  return new NextResponse(new Uint8Array(jpeg), {
    headers: {
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
      "Content-Type": "image/jpeg",
    },
  });
}
