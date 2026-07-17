import { NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { cleanEmail, cleanPhone, cleanText, optionalNumber, requireContact, uuid } from "@/lib/crm-validation";

const customerSelect =
  "id,title,first_name,last_name,email,phone,alternate_phone,house_name_number,street,address_line_1,address_line_2,address_line_3,city,county,postcode,country,latitude,longitude,customer_status,marketing_email,marketing_sms,marketing_phone,marketing_whatsapp,notes,tags,assigned_user_id,created_at,updated_at";

function searchTerm(value: string) {
  return value.replace(/[%_,]/g, " ").trim().slice(0, 120);
}

function compactCustomer(row: Record<string, unknown>) {
  return {
    id: row.id,
    title: row.title,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    phone: row.phone,
    alternate_phone: row.alternate_phone,
    postcode: row.postcode,
    address_line_1: row.address_line_1,
    city: row.city,
    customer_status: row.customer_status,
  };
}

async function findDuplicateCustomers(body: Record<string, unknown>) {
  const email = cleanEmail(body.email);
  const phone = cleanPhone(body.phone);
  const firstName = cleanText(body.first_name, 100);
  const lastName = cleanText(body.last_name, 100);
  const postcode = cleanText(body.postcode, 20).toUpperCase();
  const filters: string[] = [];

  if (email) filters.push(`email.eq.${email}`);
  if (phone) filters.push(`phone.eq.${phone}`, `alternate_phone.eq.${phone}`);
  if (firstName && lastName && postcode) {
    filters.push(`and(first_name.ilike.${firstName},last_name.ilike.${lastName},postcode.ilike.${postcode})`);
  }

  if (!filters.length) return [];

  const { data, error } = await getSupabaseAdmin()
    .from("crm_customers")
    .select(customerSelect)
    .is("archived_at", null)
    .or(filters.join(","))
    .limit(10);

  if (error) throw error;
  return (data ?? []).map((row) => compactCustomer(row as Record<string, unknown>));
}

export async function GET(request: Request) {
  if (!(await requireStaffUser())) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });

  const query = searchTerm(new URL(request.url).searchParams.get("q") ?? "");
  let db = getSupabaseAdmin()
    .from("crm_customers")
    .select(customerSelect)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(query ? 25 : 50);

  if (query) {
    const pattern = `%${query}%`;
    db = db.or(
      `first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern},alternate_phone.ilike.${pattern},postcode.ilike.${pattern},house_name_number.ilike.${pattern},address_line_1.ilike.${pattern},city.ilike.${pattern}`,
    );
  }

  const { data, error } = await db;
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ customers: data });
}

export async function POST(request: Request) {
  const user = await requireStaffUser();
  if (!user) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const email = cleanEmail(body.email);
    const phone = cleanPhone(body.phone);
    requireContact(email, phone);

    const duplicates = await findDuplicateCustomers(body);
    if (duplicates.length && body.allow_possible_duplicate !== true) {
      return NextResponse.json(
        {
          error: "Possible existing customer found.",
          duplicates,
        },
        { status: 409 },
      );
    }

    const payload = {
      title: cleanText(body.title, 40) || null,
      first_name: cleanText(body.first_name, 100),
      last_name: cleanText(body.last_name, 100),
      email: email || null,
      phone: phone || null,
      alternate_phone: cleanPhone(body.alternate_phone) || null,
      house_name_number: cleanText(body.house_name_number, 200) || null,
      street: cleanText(body.street, 200) || null,
      address_line_1: cleanText(body.address_line_1, 300) || null,
      address_line_2: cleanText(body.address_line_2, 300) || null,
      address_line_3: cleanText(body.address_line_3, 300) || null,
      city: cleanText(body.city, 150) || null,
      county: cleanText(body.county, 150) || null,
      postcode: cleanText(body.postcode, 20).toUpperCase() || null,
      country: cleanText(body.country, 100) || "United Kingdom",
      latitude: optionalNumber(body.latitude),
      longitude: optionalNumber(body.longitude),
      marketing_email: body.marketing_email === true || body.marketing_email === "on",
      marketing_sms: body.marketing_sms === true || body.marketing_sms === "on",
      marketing_phone: body.marketing_phone === true || body.marketing_phone === "on",
      marketing_whatsapp: body.marketing_whatsapp === true || body.marketing_whatsapp === "on",
      customer_status: cleanText(body.customer_status, 80) || "Prospect",
      notes: cleanText(body.notes) || null,
      tags: Array.isArray(body.tags)
        ? body.tags.map((value) => cleanText(value, 50)).filter(Boolean)
        : [cleanText(body.source, 50), cleanText(body.customer_type, 50)].filter(Boolean),
      assigned_user_id: uuid(body.assigned_user_id),
      created_by: user.id,
    };

    if (!payload.first_name || !payload.last_name) throw new Error("First and last name are required.");

    const { data, error } = await getSupabaseAdmin().from("crm_customers").insert(payload).select(customerSelect).single();
    if (error) {
      const duplicate = error.code === "23505";
      return NextResponse.json(
        {
          error: duplicate ? "A customer with this email or phone already exists." : error.message,
          duplicates: duplicate ? duplicates : undefined,
        },
        { status: duplicate ? 409 : 500 },
      );
    }

    return NextResponse.json({ customer: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid customer." }, { status: 400 });
  }
}
