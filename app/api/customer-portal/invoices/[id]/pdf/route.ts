import { NextResponse } from "next/server";
import { buildInvoicePdf } from "@/lib/invoice-pdf";
import { getInvoiceDocument } from "@/lib/invoice-document";
import { authenticatePortalCustomer } from "@/lib/customer-portal";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json() as { email?: string; code?: string };
    const auth = await authenticatePortalCustomer({ email: body.email ?? "", code: body.code ?? "" });
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

    const document = await getInvoiceDocument(id);
    if (String(document.invoice.customer_id) !== String(auth.customer.id)) {
      return NextResponse.json({ error: "Invoice not found for this portal." }, { status: 404 });
    }

    const bytes = await buildInvoicePdf(document);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${document.invoice.invoice_number}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Portal invoice PDF failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Unable to generate invoice PDF." }, { status: 500 });
  }
}
