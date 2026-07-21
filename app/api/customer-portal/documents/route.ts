import { NextResponse } from "next/server";
import { authenticatePortalCustomer } from "@/lib/customer-portal";

const allowedTypes = new Set(["licence", "proof_of_address", "finance_document", "other"]);
const allowedMime = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const email = String(form.get("email") || "");
    const code = String(form.get("code") || "");
    const file = form.get("file");
    const documentType = allowedTypes.has(String(form.get("document_type"))) ? String(form.get("document_type")) : "other";
    const auth = await authenticatePortalCustomer({ email, code });
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a document to upload." }, { status: 400 });
    if (!allowedMime.has(file.type)) return NextResponse.json({ error: "Upload a PDF, JPG, PNG or WebP file." }, { status: 400 });
    if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "File must be smaller than 20MB." }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const safeName = file.name.replace(/[^a-z0-9._-]/gi, "_").slice(0, 120) || "customer-document";
    const storagePath = `customer/${auth.customer.id}/${Date.now()}-${safeName}`;
    const upload = await auth.db.storage.from("crm-documents").upload(storagePath, buffer, { contentType: file.type, upsert: false });
    if (upload.error) throw upload.error;

    const { data, error } = await auth.db.from("crm_documents").insert({
      file_name: file.name,
      storage_path: storagePath,
      mime_type: file.type,
      size_bytes: file.size,
      document_type: documentType,
      customer_id: auth.customer.id,
    }).select("id,file_name,document_type,mime_type,size_bytes,created_at").single();
    if (error) throw error;

    return NextResponse.json({ document: data });
  } catch (error) {
    console.error("Portal document upload failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to upload document." }, { status: 500 });
  }
}
