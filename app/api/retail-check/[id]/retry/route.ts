import { retryRetailCheck } from "@/lib/retail-checks";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const data = await retryRetailCheck(id);
    return Response.json({ recordId: data.id, requestId: data["Request ID"], record: data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to retry Retail Check" }, { status: 400 });
  }
}
