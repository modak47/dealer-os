export async function GET() {

  const token = process.env.AIRTABLE_API_KEY ?? process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID ?? "appHKjdcxKXzwTPGj";

  if (!token) return Response.json({ error: "Airtable reference data is not configured" }, { status: 503 });

  let allRecords: any[] = [];
  let offset = "";

  do {

    const url =
      `https://api.airtable.com/v0/${baseId}/Makes` +
      (offset
        ? `?offset=${offset}`
        : "");

    const response =
      await fetch(url, {
        headers: {
          Authorization:
            `Bearer ${token}`,
        },
      });

    const data =
      await response.json();

    allRecords = [
      ...allRecords,
      ...data.records,
    ];

    offset =
      data.offset || "";

  } while (offset);

  return Response.json(

    allRecords.map(
      (record: any) => ({
        make:
          record.fields.Name,
      })
    )

  );
}
