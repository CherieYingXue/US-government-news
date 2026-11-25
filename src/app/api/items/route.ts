import { listItems } from "@/lib/queries";

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  try {
    const data = await listItems({
      q: p.get("q") ?? undefined,
      topic: p.get("topic") ?? undefined,
      channel: p.get("channel") ?? undefined,
      category: p.get("category") ?? undefined,
      agency: p.get("agency") ?? undefined,
      range: p.get("range") ?? undefined,
      headlineOnly: p.get("headline") === "1",
      offset: Number(p.get("offset") ?? 0) || 0,
    });
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[api/items]", error instanceof Error ? error.message : error);
    return Response.json({ error: "Could not load actions." }, { status: 500 });
  }
}
