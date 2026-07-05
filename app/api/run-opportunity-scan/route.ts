export async function POST() {
  try {
    const response = await fetch(
      process.env.OPPORTUNITY_SCANNER_URL ?? "https://ozone-pending-recipes-edmonton.trycloudflare.com/run-scan",
      {
        method: "POST",
      }
    );

    const text = await response.text();

    console.log("STATUS:", response.status);
    console.log("RESPONSE:", text);

    return Response.json({
      success: true,
      status: response.status,
      response: text,
    });
  } catch (error) {
    console.error(error);

    return Response.json(
      {
        success: false,
        error: String(error),
      },
      { status: 500 }
    );
  }
}
